/** Sync with posthog/frontend/src/types.ts. When onAction support is available, refactor. */
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

export type ConversionDefinition = {
    eventDetails: {
        event: string,
        text?: string | null,
        href?: string | null,
        url?: string | null,
        url_matching?: ActionStepUrlMatching | null,
    }
    conversionName: string
}

function isValidConversionDefinition(input: any): input is ConversionDefinition {
    if (!input.conversionName) {
        return false
    }
    if (!input.eventDetails?.event) {
        return false
    }
    if (input.eventDetails?.url && !input.eventDetails?.url_matching) {
        console.error('Definition must specify url_matching if eventDetails.url is set. Possible options: contains, regex, exact')
        return false
    }
    return true
}

function validateConversionDefinitions(input: any[]): input is ConversionDefinition[] {
    if (!input.length) {
        return false
    }
    return input.every(isValidConversionDefinition)
}

export async function setupPlugin({ config, global }) {
    if (!config.conversion_definitions || !config.zapier_webhook_url) {
        throw new Error('Missing config values! Make sure to set conversion_definitions and zapier_webhook_url')
    }
    let conversionDefinitions: ConversionDefinition[] = []
    try {
        conversionDefinitions = JSON.parse(config.conversion_definitions)
    } catch (error) {
        throw new Error('conversion_definitions is not valid JSON')
    }
    if (!validateConversionDefinitions(conversionDefinitions)) {
        throw new Error('conversion_definitions does not match the required input type')
    }
    global.conversionDefinitions = conversionDefinitions
}

interface AutocaptureCriteria {
    text?: string | null
    href?: string | null
}

function shouldCheckForAutocapture(criteria: AutocaptureCriteria) {
    // If any of the criteria is set, we should check for autocapture
    return criteria.text || criteria.href
}

function elementsMatchAutocaptureCriteria(criteria: AutocaptureCriteria, elements?: ElementType[]) {
    if (!elements?.length) {
        return false
    }
    if (criteria.text) {
        elements = elements.filter(element => element.text === criteria.text)
    }
    if (criteria.href) {
        elements = elements.filter(element => element.href === criteria.href || element.attributes.attr__href === criteria.href)
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

export function eventMatchesDefinition(event: EventType, eventDetails: ConversionDefinition['eventDetails']) {
    if (event.event !== eventDetails.event){
        return false
    }
    if (shouldCheckForAutocapture(eventDetails) && !elementsMatchAutocaptureCriteria(eventDetails, event.elements)) {
        return false
    }
    if (eventDetails.url && eventDetails.url_matching) {
        if (!matchValue(eventDetails.url, event.properties['$current_url'], eventDetails.url_matching)) {
            return false
        }
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

export function getConversionEventData(event: EventType, eventNames: string[], conversionDefinitions: ConversionDefinition[]): ConversionEventData | null {
    if (!eventNames.length || !conversionDefinitions.length || !eventNames.includes(event.event)) {
        return null
    }
    const conversion = conversionDefinitions.find(({ eventDetails }) =>
        eventMatchesDefinition(event, eventDetails)
    )
    if (conversion) {
        if (!event.properties.gclid) {
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
        console.log(`Publishing ${conversions.length} conversions (from batch of ${events.length} events) to Zapier.`)
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
