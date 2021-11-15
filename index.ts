

export interface EventType {
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

export async function setupPlugin({ config, global }) {
    if (!config.action_map || !config.zapier_webhook_url) {
        throw new Error('Missing config values! Make sure to set conversion_definitions and zapier_webhook_url')
    }
    const actionMap = config.action_map.split(',').map(entry => entry.split(':'))
    global.actionMap = actionMap
}

export function formatTimestampForGoogle(date: string){
    if (date?.match(/Z$/)) {
        return date.replace(/Z$/, '+0000')
    }
    if (date?.match(/\+00:00$/)) {
        return date.replace(/\+00:00$/, '+0000')
    }
    if (date?.match(/\+00$/)) {
        return date.replace(/\+00$/, '+0000')
    }
    return date
}

type ConversionEventData = {
    gclid: string
    conversionName: string
    timestamp: string
}

export function formatConversionEventData(event: EventType, conversionName: string): ConversionEventData | null {
    const gclid = event.properties?.gclid || event.person?.properties?.gclid
    if (!gclid) {
        return null
    }
    return {
        gclid,
        conversionName: conversionName,
        timestamp: formatTimestampForGoogle(event.sent_at || event.timestamp || new Date().toISOString()),
    }
}

export async function runEveryHour({ config, global, storage }): Promise<void> {
    const { actionMap } = global
    const { zapier_webhook_url } = config
    const conversions: ConversionEventData[] = []
    actionMap.forEach(([actionId, conversionName]) => {
        // the API call will take too long to run here...
    })
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

