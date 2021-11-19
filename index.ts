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

type EventsByAction = Record<string, {
    conversionName: string
    items: EventType[],
    loadingState: null | 'loading' | 'loaded' | 'error'
}>

type PersonDataByDistinctId = Record<string, {
    gclid: string | null
    loadingState: null | 'loading' | 'loaded' | 'error'
}>

type GlobalState = {
    ph_host: string
    ph_project_key: string
    ph_personal_key: string
    eventsByAction: EventsByAction
    personDataByDistinctId: PersonDataByDistinctId
}

type ConversionEventData = {
    action_id: number
    gclid: string
    conversion_name: string
    timestamp: string
}

export async function setupPlugin({ config, global, storage }: { config: any, global: GlobalState, storage: any }) {
    const { action_map, zapier_webhook_url, initial_last_invoked_at, ph_host, ph_project_key, ph_personal_key } = config
    if (!action_map || !zapier_webhook_url || !ph_project_key || !ph_personal_key) {
        throw new Error('Missing config values! Make sure to set conversion_definitions and zapier_webhook_url')
    }

    const eventsByAction: EventsByAction = {}
    action_map.split(',').forEach(pair => {
        const [actionId, conversionName] = pair.split(':')
        eventsByAction[actionId] = {
            conversionName,
            items: [],
            loadingState: null,
        }
    })
    global.eventsByAction = eventsByAction

    global.personDataByDistinctId = {} as PersonDataByDistinctId

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
    global.ph_host = ph_host || 'https://app.posthog.com'
    global.ph_project_key = ph_project_key
    global.ph_personal_key = ph_personal_key
}

function isValidDate(date: string): boolean {
    const dateObj = new Date(date)
    return dateObj.toString() !== 'Invalid Date'
}

function formatTimestampForGoogle(date: string){
    if (isValidDate(date)) {
        const dateObj = new Date(date)
        dateObj.setMilliseconds(0)
        return dateObj.toISOString().replace(/\.\d+Z$/, '+0000')
    } else {
        console.warn(`Received invalid date "${date}`)
        return date
    }
}

function extractGclidFromEvent(event: EventType): string | null {
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

function formatConversionEventData(event: EventType, gclid: string, conversionName: string, actionId: number): ConversionEventData | null {
    return {
        action_id: actionId,
        gclid,
        conversion_name: conversionName,
        timestamp: formatTimestampForGoogle(event.sent_at || event.timestamp || ''),
    }
}

export const jobs = {
    getEventsForAction: async ({ actionId, url, retries = 0 }: { actionId: number, url: string, retries: number }, { global, jobs, storage }: { global: GlobalState, jobs: any, storage: any }) => {
        console.log(`getEventsForAction: Making request to ${url}`)
        global.eventsByAction[actionId].loadingState = 'loading'
        const { ph_host, ph_project_key, ph_personal_key } = global
        const response = await posthog.api.get(url, {
            host: ph_host,
            projectApiKey: ph_project_key,
            personalApiKey: ph_personal_key,
        })
        if (response.status != 200) {
            throw new Error(`Error getting events: ${response.status}`)
        }
        const data = (await response.json())
        if (!data.results || !('next' in data)) {
            console.warn(`Malformed response, retrying (${retries} / 3)`)
            if (retries < 3) {
                await jobs.getEventsForAction({
                    actionId,
                    url,
                    retries: retries + 1
                }).runIn(500, 'milliseconds')
            } else {
                console.error(`Failed to get events for action ${actionId} after 3 tries`)
                global.eventsByAction[actionId].loadingState = 'error'
                return
            }
        }
        global.eventsByAction[actionId].items.push(...data.results)
        const hasNext = !!data.next
        if (hasNext) {
            await jobs.getEventsForAction({
                actionId,
                url: data.next.replace(ph_host, ''),
                retries
            }).runIn(500, 'milliseconds')
        } else {
            console.log(`getEventsForAction: Finished fetching events for action ${actionId}`)
            global.eventsByAction[actionId].loadingState = 'loaded'
            const now = new Date().toISOString()
            await storage.set('last_invoked_at', now)
        }
    },

    getPersonsData: async ({ distinctIdsToFetch }: { distinctIdsToFetch: string[] }, { global, jobs }: { global: GlobalState, jobs: any }) => {
        if (!distinctIdsToFetch.length) {
            return
        }
        // Shift to get & remove the first list item
        const distinctId = distinctIdsToFetch.shift()
        console.log(`getPersonsData: Fetching person "${distinctId}" (${distinctIdsToFetch.length}) remaining...`)
        global.personDataByDistinctId[distinctId] = { gclid: null, loadingState: 'loading' }
        const { ph_host, ph_project_key, ph_personal_key } = global
        try {
            const people = await posthog.api.get('/api/person?distinct_id=${distinctId}', {
                host: ph_host,
                projectApiKey: ph_project_key,
                personalApiKey: ph_personal_key,
            })
            const person = people?.results?.[0]
            let gclid = null
            if (person) {
                gclid = person.properties.gclid ?? person.properties.$initial_gclid ?? null
            }
            global.personDataByDistinctId[distinctId] = {
                gclid,
                loadingState: 'loaded'
            }
        } catch (err) {
            console.error(`Failed to fetch person with distinct_id ${distinctId}`, err)
            global.personDataByDistinctId[distinctId].loadingState = 'error'
        }
        await jobs.getPersonsData({ distinctIdsToFetch }).runIn(500, 'milliseconds')
    },
}

export async function runEveryMinute({ jobs, global, storage }: { jobs: any, global: GlobalState, storage: any }): Promise<void> {
    const { eventsByAction, personDataByDistinctId } = global
    const eventStorage = Object.values(eventsByAction)
    const personStorage = Object.values(personDataByDistinctId)

    // Only fetch again if in the steady state
    const shouldFetchEvents = eventStorage.every(({ loadingState }) => loadingState === null)
    if (shouldFetchEvents) {
        const after = await storage.get('last_invoked_at')
        if (!isValidDate(after)) {
            throw new Error(`Missing or invalid last_invoked_at: "${after}"`)
        }
        for (const actionId in eventsByAction) {
            await jobs.getEventsForAction({
                actionId,
                url: `/api/event?action_id=${actionId}&after=${after}`
            }).runNow()
        }
    }

    // If all events are loaded...
    const eventsLoaded = eventStorage.every(({ loadingState }) => loadingState === 'loaded')
    if (eventsLoaded) {

        // ...fetch persons data for every event without a GCLID
        const shouldFetchPersons = !personStorage.length || personStorage.every(({ loadingState }) => loadingState === null)
        if (shouldFetchPersons) {
            const distinctIdsToFetch: string[] = []
            eventStorage.forEach(({ items: events }) => {
                events.forEach(event => {
                    const gclid = extractGclidFromEvent(event)
                    if (event.distinct_id && !gclid) {
                        distinctIdsToFetch.push(event.distinct_id)
                    }
                })
            })
            await jobs.getPersonsData({ distinctIdsToFetch }).runNow()
        }

        // If all required persons are loaded...
        const personsLoaded = personStorage.every(({ loadingState }) => ['loading', 'error'].includes(loadingState))
        if (personsLoaded) {
            // TODO
            // transform eventStorage with formatConversionEventData
            // pass the transformed data to a postToZapier job,
            // which will call postToZapier in batches of 500
        }
    }
}

async function postToZapier(conversions: ConversionEventData[], webhook_url: string): Promise<void> {
    console.log(`Publishing ${conversions.length} conversions to Zapier.`)
    // Zapier accepts a single item or an array
    await fetch(webhook_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(conversions),
    })
}

