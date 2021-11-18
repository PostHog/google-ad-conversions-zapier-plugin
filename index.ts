

export interface EventType {
    distinct_id: string
    elements: any[]
    elements_hash: string | null
    id: number | string
    properties: Record<string, any>
    timestamp?: string
    sent_at?: string
    person?: Record<string, any> | null
    event: string
}

declare const posthog: any

export async function setupPlugin({ config, global, storage }) {
    const { action_map, zapier_webhook_url, initial_last_invoked_at, ph_host, ph_project_key, ph_personal_key } = config
    if (!action_map || !zapier_webhook_url || !ph_project_key || !ph_personal_key) {
        throw new Error('Missing config values! Make sure to set conversion_definitions and zapier_webhook_url')
    }
    const actionMap = Object.fromEntries(config.action_map.split(',').map(entry => entry.split(':')))
    global.actionMap = actionMap
    if (initial_last_invoked_at) {
        if (!isValidDate(initial_last_invoked_at)) {
            throw new Error('initial_last_invoked_at is not a valid ISO date.')
        }
        await storage.set('last_invoked_at', initial_last_invoked_at)
    } else {
        const now = new Date().toISOString()
        console.log(`No initial_last_invoked_at set; using ${now}`)
        await storage.set('last_invoked_at', now)
    }
    global.ph_host = ph_host || 'http://app.posthog.com'
    global.ph_project_key = ph_project_key
    global.ph_personal_key = ph_personal_key
}

function isValidDate(date: string): boolean {
    const dateObj = new Date(date)
    return dateObj.toString() !== 'Invalid Date'
}

export function formatTimestampForGoogle(date: string){
    if (isValidDate(date)) {
        const dateObj = new Date(date)
        dateObj.setMilliseconds(0)
        return dateObj.toISOString().replace(/\.\d+Z$/, '+0000')
    } else {
        console.warn(`Received invalid date "${date}`)
        return date
    }
}

type ConversionEventData = {
    action_id: number
    gclid: string
    conversion_name: string
    timestamp: string
}

async function getGclidForPerson(distinctId, { ph_host, ph_project_key, ph_personal_key }): Promise<string | null> {
    // TODO support massively parallel requests, https://github.com/PostHog/posthog/issues/7192
    try {
        const people = await posthog.api.get(`/api/person?distinct_id=${distinctId}`, { host: ph_host, projectApiKey: ph_project_key, personalApiKey: ph_personal_key })
        const person = people?.results?.[0]
        if (person) {
            return person.properties.gclid ?? person.properties.$initial_gclid ?? null
        }
    } catch (err) {
        console.error(`Failed to fetch person with distinct_id ${distinctId}`, err)
    }
    return null
}

async function getEventsForAction(actionId, after, { ph_host, ph_project_key, ph_personal_key }) {
    // Fetches and transforms event data for the given action
    const events = []
    let hasNext = true
    let retries = 0
    let url = `/api/event?action_id=${actionId}&after=${after}`

    while (hasNext && retries < 3) {
        console.log(`get_conversions_for_action: Making request to ${url}`)
        const response = await posthog.api.get(url, {
            host: ph_host,
            projectApiKey: ph_project_key,
            personalApiKey: ph_personal_key
        })
        if (response.status != 200) {
            throw new Error(`Error getting events: ${response.status}`)
        }
        const data = (await response.json())
        if (!data.results || !('next' in data)) {
            console.warn(`Malformed response, retrying (${retries} / 3)`)
        }
        events.push(...data.results)
        hasNext = !!data.next
        url = data.next
    }

    return events
}

async function extractGclidFromEvent(event: EventType, { ph_host, ph_project_key, ph_personal_key }: any): Promise<string | null> {
    const eventProperties = event.properties || {}
    const personProperties = event.person?.properties || {}

    if ('gclid' in eventProperties) {
        return eventProperties.gclid
    }
    if ('gclid' in personProperties) {
        return personProperties.gclid
    }
    if ('$initial_gclid' in personProperties) {
        return personProperties.$initial_gclid
    }
    if ('$set' in eventProperties) {
        const { $set } = eventProperties
        if ('gclid' in $set) {
            return $set.gclid
        }
        if ('$initial_gclid' in $set) {
            return $set.$initial_gclid
        }
    }
    if ('$set_once' in eventProperties) {
        const { $set_once } = eventProperties
        if ('gclid' in $set_once) {
            return $set_once.gclid
        }
        if ('$initial_gclid' in $set_once) {
            return $set_once.$initial_gclid
        }
    }

    // Gclid not available on event or person properties, lookup person
    if (event.distinct_id) {
        const gclid = await getGclidForPerson(event.distinct_id, { ph_host, ph_project_key, ph_personal_key })
        if (gclid) {
            return gclid
        }
    }

    return null
}

export async function formatConversionEventData(event: EventType, conversionName: string, actionId: number, { ph_host, ph_project_key, ph_personal_key }: any): Promise<ConversionEventData | null> {
    const gclid = await extractGclidFromEvent(event, { ph_host, ph_project_key, ph_personal_key })
    if (!gclid) {
        return null
    }
    return {
        action_id: actionId,
        gclid,
        conversion_name: conversionName,
        timestamp: formatTimestampForGoogle(event.sent_at || event.timestamp || ''),
    }
}

export const jobs = {
    extractAndSendConversions: async ({ global, storage }) => {
        const { actionMap } = global
        const conversions = [] as (ConversionEventData | null)[]

        for (const actionId in actionMap) {
            const conversionName = actionMap[actionId]
            const after = await storage.get('last_invoked_at')
            if (!isValidDate(after)) {
                throw new Error(`Missing or invalid last_invoked_at: "${after}"`)
            }
            const { ph_host, ph_project_key, ph_personal_key } = global
            const events = await getEventsForAction(actionId, after, { ph_host, ph_project_key, ph_personal_key })
            const conversionData = await Promise.all(events.map(e => formatConversionEventData(e, conversionName, parseInt(actionId), { ph_host, ph_project_key, ph_personal_key })))
            conversions.push(...conversionData)
        }

        console.log({ conversions: JSON.stringify(conversions) })
        storage.set('last_invoked_at', new Date().toISOString())
    }
}

export async function runEveryMinute({ config, global, storage, jobs }): Promise<void> {
    await jobs.extractAndSendConversions().runNow()
}

// When the above works, call this

// async function postToZapier(conversions: ConversionEventData[], webhook_url: string): Promise<void> {
//     console.log(`Publishing ${conversions.length} conversions to Zapier.`)
//     // Zapier accepts a single item or an array
//     await fetch(webhook_url, {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/json',
//         },
//         body: JSON.stringify(conversions),
//     })
// }

