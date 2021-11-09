declare const posthog: any

/** Sync with posthog/frontend/src/types.ts */
export interface UserBasicType {
    id: number
    uuid: string
    distinct_id: string
    first_name: string
    email: string
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

export async function setupPlugin({ config, global }) {
    const actionMap = config.action_map.split(',').map(entry => entry.split(':'))
    const actions: ActionType[] = await Promise.all(actionMap.map(([actionId]) => getActionDefinition(actionId)))

    const conversionDefinitions = []
    actionMap.forEach(([, conversionName], index) => {
        const action = actions[index]
        conversionDefinitions.push({
            id: action.id,
            eventDetails: action.steps[0],
            conversionName,
        })
    })

    global.conversionDefinitions = conversionDefinitions
}

async function getActionDefinition(actionId) {
    const response = await posthog.api.get(`/api/projects/@current/actions/${actionId}/`, {
        host: 'http://localhost:8000',
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

export function getConversionEvent(event, eventNames, conversionDefinitions) {
    if (!event.properties.gclid || !eventNames.length || !conversionDefinitions.length) {
        return null
    }
    if (!eventNames.includes(event.event)) {
        return null
    }
    const conversion = conversionDefinitions.find(({ eventDetails }) =>
        eventMatchesDefinition(event, eventDetails)
    )
    return conversion?.conversionName
}

export function eventMatchesDefinition(event, eventDetails) {
    const strictEqualityKeys = ['event']
    const nullableEqualityKeys = ['tag_name', 'text', 'href', 'selector']
    strictEqualityKeys.forEach(key => {
        if (event[key] !== eventDetails[key]) {
            return false
        }
    })
    nullableEqualityKeys.forEach(key => {
        if (eventDetails[key] && event[key] !== eventDetails[key]) {
            if (key === 'selector') {
                console.warn(`Selector "${event[key]}" does not exactly match "${eventDetails[key]}". Partial selector matches not yet implemented.`)
            }
            return false
        }
    })
    if (eventDetails.url && eventDetails.url_matching) {
        if (!matchValue(event.url, eventDetails.url, eventDetails.url_matching)) {
            return false
        }
    }
    if (eventDetails.properties.length) {
        let propertyMatchResults: boolean[] = []
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

export async function exportEvents(events, { config, global }) {
    const { conversionDefinitions } = global
    const postHogEventNames = conversionDefinitions.map(({ eventDetails }) => eventDetails.event)
    events.forEach(event => getConversionEvent(event, postHogEventNames, conversionDefinitions))
}

// async function uploadConversion(gclid) {

// }
