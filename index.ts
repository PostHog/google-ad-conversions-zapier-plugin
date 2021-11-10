declare const posthog: any

/** Sync with posthog/frontend/src/types.ts */
export interface UserBasicType {
    id: number
    uuid: string
    distinct_id: string
    first_name: string
    email: string
}

export interface ElementType {
    attr_class?: string[]
    attr_id?: string
    attributes: Record<string, string>
    href: string
    nth_child: number
    nth_of_type: number
    order: number
    tag_name: string
    text?: string
}

export interface EventType {
    elements: ElementType[]
    elements_hash: string | null
    id: number | string
    properties: Record<string, any>
    timestamp?: string
    sent_at?: string
    person?: null
    event: string
}

export interface ActionType {
    count?: number
    created_at: string
    deleted?: boolean
    id: number
    is_calculating?: boolean
    last_calculated_at?: string
    name: string
    post_to_slack?: boolean
    slack_message_format?: string
    steps?: ActionStepType[]
    created_by: UserBasicType | null
}

export enum ActionStepUrlMatching {
    Contains = 'contains',
    Regex = 'regex',
    Exact = 'exact',
}

export type PropertyFilterValue = string | number | (string | number)[] | null

export enum PropertyOperator {
    Exact = 'exact',
    IsNot = 'is_not',
    IContains = 'icontains',
    NotIContains = 'not_icontains',
    Regex = 'regex',
    NotRegex = 'not_regex',
    GreaterThan = 'gt',
    LessThan = 'lt',
    IsSet = 'is_set',
    IsNotSet = 'is_not_set',
}

export interface PropertyFilter {
    key: string
    operator: PropertyOperator | null
    type: string
    value: PropertyFilterValue
}

export type EmptyPropertyFilter = Partial<PropertyFilter>

export type AnyPropertyFilter = PropertyFilter | EmptyPropertyFilter

export interface ActionStepType {
    event?: string
    href?: string | null
    id?: number
    name?: string
    properties?: AnyPropertyFilter[]
    selector?: string | null
    tag_name?: string
    text?: string | null
    url?: string | null
    url_matching?: ActionStepUrlMatching
    isNew?: string
}

export type ActionSingleEventDefinition = {
    id: number
    eventDetails: {
        id?: number | string,
        event?: string,
        tag_name: string | null,
        text: string | null,
        href: string | null,
        selector: string | null,
        name: string | null,
        url: string | null,
        url_matching: ActionStepUrlMatching | null,
        properties: AnyPropertyFilter[] | null,
    }
    conversionName: string
}

export async function setupPlugin({ config, global }) {
    if (!config.action_map || !config.zapier_webhook_url) {
        throw new Error('Missing config values! Make sure to set action_map and zapier_webhook_url')
    }
    const actionMap = config.action_map.split(',').map(entry => entry.split(':'))
    const actions: ActionType[] = await Promise.all(actionMap.map(([actionId]) => getActionDefinition(actionId, config.host)))

    const conversionDefinitions: ActionSingleEventDefinition[] = []
    actionMap.forEach(([, conversionName], index) => {
        const action = actions[index]
        conversionDefinitions.push(...action.steps.map(step => ({
            id: action.id,
            eventDetails: {
                tag_name: null,
                text: null,
                href: null,
                selector: null,
                name: null,
                url: null,
                url_matching: null,
                properties: [],
                ...step,
            },
            conversionName,
        })))
    })

    global.conversionDefinitions = conversionDefinitions
}

async function getActionDefinition(actionId: string, host?: string): Promise<ActionType> {
    const response = await posthog.api.get(`/api/projects/@current/actions/${actionId}/`, {
        host
    })
    const body = await response.json()
    if (response.status !== 200) {
        throw new Error(`Failed to get action definition for ${actionId}: ${body.detail}`)
    }
    if (!body.steps || body.steps.length !== 1) {
        throw new Error(`Action ${actionId} should have no more than 1 step (found ${body.steps?.length ?? 0})`)
    }
    return body
}

interface AutocaptureCriteria {
    tag_name: string | null
    text: string | null
    href: string | null
    selector: string | null
}

function shouldCheckForAutocapture(criteria: AutocaptureCriteria) {
    // If any of the criteria is set, we should check for autocapture
    return !['tag_name', 'text', 'href', 'selector'].every(key => criteria[key] === null)
}

function elementsMatchAutocaptureCriteria(elements: ElementType[], criteria: AutocaptureCriteria) {
    if (criteria.tag_name) {
        elements = elements.filter(element => element.tag_name === criteria.tag_name)
    }
    if (criteria.text) {
        elements = elements.filter(element => element.text === criteria.text)
    }
    if (criteria.href) {
        elements = elements.filter(element => element.href === criteria.href)
    }
    if (criteria.selector) {
        console.warn('Partial selector matches not yet implemented.')
        return false
    }
    return elements.length > 0
}

export function matchValue(needle, haystack, operator: PropertyOperator | ActionStepUrlMatching): boolean {
    const REGEX_WARNING = 'Regex matching with NodeJS library, while action matching usually uses Postgres regex.'
    switch (operator) {
        case PropertyOperator.Exact:
        case ActionStepUrlMatching.Exact:
            return needle === haystack
        case PropertyOperator.IsNot:
            return needle !== haystack
        case ActionStepUrlMatching.Contains:
            return haystack.includes(needle)
        case PropertyOperator.IContains:
            return haystack.toLowerCase().includes(needle.toLowerCase())
        case PropertyOperator.NotIContains:
            return !haystack.toLowerCase().includes(needle.toLowerCase())
        case PropertyOperator.Regex:
        case ActionStepUrlMatching.Regex:
            console.warn(REGEX_WARNING)
            return new RegExp(needle).test(haystack)
        case PropertyOperator.NotRegex:
            console.warn(REGEX_WARNING)
            return !(new RegExp(needle).test(haystack))
        case PropertyOperator.GreaterThan:
            return haystack > needle
        case PropertyOperator.LessThan:
            return haystack < needle
        case PropertyOperator.IsSet:
            return needle === 0 || needle === false || !!needle
        case PropertyOperator.IsNotSet:
            return needle === null || needle === ''
        default:
            return false
    }
}

export function eventMatchesDefinition(event: EventType, eventDetails: ActionSingleEventDefinition['eventDetails']) {
    if (event.event !== eventDetails.event){
        return false
    }
    if (shouldCheckForAutocapture(eventDetails) && !elementsMatchAutocaptureCriteria(event.properties.elements, eventDetails)) {
        return false
    }
    if (eventDetails.url && eventDetails.url_matching) {
        if (!matchValue(eventDetails.url, event.properties['$current_url'], eventDetails.url_matching)) {
            return false
        }
    }
    if (eventDetails.properties.length) {
        let propertyMatchResults: boolean[] = []
        if (eventDetails.properties.length > event.properties.length) {
            return false
        }
        eventDetails.properties.forEach(({ key, type, value, operator }) => {
            if (type !== 'event') {
                throw new Error('Only event properties are supported at this time')
            }
            if (!(key in event.properties)) {
                propertyMatchResults.push(false)
                return
            }
            let match = false
            if (Array.isArray(value)) {
                match = value.some(v => matchValue(v, event.properties[key], operator))
            } else {
                match = matchValue(value, event.properties[key], operator)
            }
            propertyMatchResults.push(match)
        })
        return propertyMatchResults.every(match => match === true)
    }
    return true
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

export function getConversionEventData(event: EventType, eventNames: string[], conversionDefinitions: ActionSingleEventDefinition[]): ConversionEventData | null {
    if (!eventNames.length || !conversionDefinitions.length || !eventNames.includes(event.event)) {
        return null
    }
    const conversion = conversionDefinitions.find(({ eventDetails }) =>
        eventMatchesDefinition(event, eventDetails)
    )
    if (conversion) {
        if (!event.properties.gclid) {
            console.log(`Conversion "${conversion.conversionName}" triggered for distinct_id "${event.properties.distinct_id}", but no gclid found`)
            return null
        }
        return {
            gclid: event.properties.gclid,
            conversionName: conversion.conversionName,
            timestamp: formatTimestampForGoogle(event.sent_at || event.timestamp || new Date().toISOString()),
        }
    }
    return null
}

export async function exportEvents(events, { config, global }) {
    const { conversionDefinitions } = global
    const postHogEventNames = conversionDefinitions.map(({ eventDetails }) => eventDetails.event)
    const conversions: ConversionEventData[] = []
    events.forEach(event => {
        const data = getConversionEventData(event, postHogEventNames, conversionDefinitions)
        if (data) {
            conversions.push(data)
        }
    })
    if (conversions.length) {
        // Zapier accepts a single item or an array
        await fetch(config.zapier_webhook_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(conversions),
        })
    }
}
