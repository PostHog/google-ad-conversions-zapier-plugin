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

type ConversionEventData = {
    action_id: number
    gclid: string
    conversion_name: string
    timestamp: string
}

type Config = {
    action_map?: string
    webhook_url?: string
}

type GlobalState = {
    actionMap: Record<string, string>
    webhookUrl: string
}

export async function setupPlugin({ config, global }: { config: Config, global: GlobalState }) {
    const { action_map, webhook_url } = config
    if (!action_map || !webhook_url) {
        throw new Error('Missing config values! Make sure to set action_map and webhook_url')
    }
    const actionMap: Record<string, string> = {}
    action_map.split(',').forEach(pair => {
        const [actionId, conversionName] = pair.split(':')
        actionMap[actionId] = conversionName
    })
    global.actionMap = actionMap
    global.webhookUrl = webhook_url
}

export function formatTimestampForGoogle(date: string){
    const dateObj = new Date(date)
    const isValid = dateObj.toString() !== 'Invalid Date'
    if (isValid) {
        dateObj.setMilliseconds(0)
        return dateObj.toISOString().replace(/\.\d+Z$/, '+0000')
    } else {
        console.warn(`Received invalid date "${date}"`)
        return date
    }
}

function getConversionName(actionId: number | string, actionMap: Record<string, string>): string | undefined {
    if (typeof actionId === 'number') {
        actionId = actionId.toString()
    }
    return actionMap[actionId]
}

export function formatConversionEventData(
    event: EventType,
    actionId: number,
    gclid: string,
    conversionName: string
): ConversionEventData | null {
    return {
        action_id: actionId,
        gclid,
        conversion_name: conversionName,
        timestamp: formatTimestampForGoogle(event.sent_at || event.timestamp || new Date().toISOString()),
    }
}

export function extractGclidFromEvent(event: EventType): string | null {
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

    return null
}

export async function getGclidForPersonByDistinctId(distinctId: string): Promise<string | null> {
    try {
        const people = await posthog.api.get(`/api/person?distinct_id=${distinctId}`)
        const person = people?.results?.[0]
        if (person) {
            return person.properties.gclid ?? person.properties.$initial_gclid ?? null
        }
    } catch (err) {
        console.error(`Failed to fetch person with distinct_id ${distinctId}`, { err })
    }
    return null
}

export async function onAction(
    { id: actionId }: { id: number },
    event: EventType,
    { global }: { global: GlobalState}): Promise<void> {
        const conversionName = getConversionName(actionId, global.actionMap)
        if (!conversionName) {
            return
        }
        let gclid = extractGclidFromEvent(event)
        if (event.distinct_id && !gclid) {
            gclid = await getGclidForPersonByDistinctId(event.distinct_id)
        }
        if (!gclid) {
            return
        }
        const conversionEventData = formatConversionEventData(event, actionId, gclid, conversionName)
        await postToWebhook(conversionEventData, global.webhookUrl)
    }

async function postToWebhook(data: ConversionEventData | ConversionEventData[], webhookUrl: string): Promise<void> {
    console.log(`Publishing conversion(s) to webhook.`)

    // Zapier accepts a single conversion or an array
    await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
}
