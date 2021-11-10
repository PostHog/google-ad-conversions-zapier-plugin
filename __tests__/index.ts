import {
    matchValue,
    PropertyOperator,
    ActionStepUrlMatching,
    eventMatchesDefinition,
    formatTimestampForGoogle,
    getConversionEventData,
} from '../index'
import type { EventType, ActionSingleEventDefinition} from '../index'


describe('matchValue', () => {
    test('matchValue Exact', () => {
        expect(matchValue('foo', 'foo', PropertyOperator.Exact)).toBe(true)
        expect(matchValue('foo', 'bar', PropertyOperator.Exact)).toBe(false)
        expect(matchValue(null, 'foo', PropertyOperator.Exact)).toBe(false)
    })

    test('matchValue IsNot', () => {
        expect(matchValue('foo', 'foo', PropertyOperator.IsNot)).toBe(false)
        expect(matchValue('foo', 'bar', PropertyOperator.IsNot)).toBe(true)
        expect(matchValue(null, 'foo', PropertyOperator.IsNot)).toBe(true)
    })

    test('matchValue Contains', () => {
        expect(matchValue('foo', 'foobar', ActionStepUrlMatching.Contains)).toBe(true)
        expect(matchValue('FOO', 'foobar', ActionStepUrlMatching.Contains)).toBe(false)
        expect(matchValue('foobar', 'foo', ActionStepUrlMatching.Contains)).toBe(false)
        expect(matchValue('/insights', 'https://app.posthog.com/insights', ActionStepUrlMatching.Contains)).toBe(true)
    })

    test('matchValue IContains', () => {
        expect(matchValue('foo', 'foobar', PropertyOperator.IContains)).toBe(true)
        expect(matchValue('FOO', 'foobar', PropertyOperator.IContains)).toBe(true)
        expect(matchValue('/insights', 'https://app.posthog.com/insights', PropertyOperator.IContains)).toBe(true)
        expect(matchValue('HTTPS', 'https://app.posthog.com/insights', PropertyOperator.IContains)).toBe(true)
    })

    test('matchValue NotIContains', () => {
        expect(matchValue('foo', 'foobar', PropertyOperator.NotIContains)).toBe(false)
        expect(matchValue('FOO', 'foobar', PropertyOperator.NotIContains)).toBe(false)
        expect(matchValue('/insights', 'https://app.posthog.com/insights', PropertyOperator.NotIContains)).toBe(false)
        expect(matchValue('HTTPS', 'https://app.posthog.com/insights', PropertyOperator.NotIContains)).toBe(false)
    })

    test('matchValue Regex', () => {
        console.warn = jest.fn()
        expect(PropertyOperator.Regex).toBe(ActionStepUrlMatching.Regex)
        expect(matchValue('foo', 'foobar', PropertyOperator.Regex)).toBe(true)
        expect(matchValue('.*', 'foobar', PropertyOperator.Regex)).toBe(true)
        expect(matchValue('\\w+', 'foobar', PropertyOperator.Regex)).toBe(true)
        expect(matchValue('\\d+', 'foobar', PropertyOperator.Regex)).toBe(false)
        // Expect console.warn to be called with info about regex caveats
        expect((console.warn as any).mock.calls.length).toBe(4)
    })

    test('matchValue NotRegex', () => {
        console.warn = jest.fn()
        expect(matchValue('foo', 'foobar', PropertyOperator.NotRegex)).toBe(false)
        expect(matchValue('.*', 'foobar', PropertyOperator.NotRegex)).toBe(false)
        expect(matchValue('\\w+', 'foobar', PropertyOperator.NotRegex)).toBe(false)
        expect(matchValue('\\d+', 'foobar', PropertyOperator.NotRegex)).toBe(true)
        // Expect console.warn to be called with info about regex caveats
        expect((console.warn as any).mock.calls.length).toBe(4)
    })

    test('matchValue GreaterThan', () => {
        expect(matchValue(1, 2, PropertyOperator.GreaterThan)).toBe(true)
        expect(matchValue(2, 2, PropertyOperator.GreaterThan)).toBe(false)
        expect(matchValue(2, 1, PropertyOperator.GreaterThan)).toBe(false)
    })

    test('matchValue LessThan', () => {
        expect(matchValue(2, 1, PropertyOperator.LessThan)).toBe(true)
        expect(matchValue(2, 2, PropertyOperator.LessThan)).toBe(false)
        expect(matchValue(1, 2, PropertyOperator.LessThan)).toBe(false)
    })

    test('matchValue IsSet', () => {
        expect(matchValue('foo', null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue(0, null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue(true, null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue(false, null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue('None', null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue('undefined', null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue('null', null, PropertyOperator.IsSet)).toBe(true)
        expect(matchValue('', null, PropertyOperator.IsSet)).toBe(false)
        expect(matchValue(null, null, PropertyOperator.IsSet)).toBe(false)
    })

    test('matchValue IsNotSet', () => {
        expect(matchValue('foo', null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue(0, null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue(true, null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue(false, null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue('None', null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue('undefined', null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue('null', null, PropertyOperator.IsNotSet)).toBe(false)
        expect(matchValue('', null, PropertyOperator.IsNotSet)).toBe(true)
        expect(matchValue(null, null, PropertyOperator.IsNotSet)).toBe(true)
    })
})

function buildEvent(event: Partial<EventType>): EventType {
    return {
        elements: event.elements || [],
        elements_hash: event.elements_hash || null,
        id: event.id || 'some_id',
        properties: event.properties || {},
        timestamp: event.timestamp || Date.now().toString(),
        person: event.person || null,
        event: event.event || '$pageview',
    }
}

function buildDefinition(details: Partial<ActionSingleEventDefinition['eventDetails']>, conversionName: string, actionId?: number): ActionSingleEventDefinition {
    const defaultDetails: ActionSingleEventDefinition['eventDetails'] = {
        id: 'some_id',
        event: '$pageview',
        tag_name: null,
        text: null,
        href: null,
        selector: null,
        url: null,
        name: null,
        url_matching: ActionStepUrlMatching.Exact,
        properties: [],
    }
    const eventDetails = {
        ...defaultDetails,
        ...details,
    }
    return {
        id: actionId ?? 0,
        eventDetails,
        conversionName: conversionName,
    }
}

describe('eventMatchesDefinition - pageview and custom events', () => {
    test('matches pageview', () => {
        const event = buildEvent({
            event: '$pageview',
        })
        const { eventDetails } = buildDefinition({
            event: '$pageview',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('matches custom event', () => {
        const event = buildEvent({
            event: 'custom_event_name',
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('does not match event with different name', () => {
        const event = buildEvent({
            event: '$pageview',
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(false)
    })
})

describe('eventMatchesDefinition - autocapture', () => {
    test('matches autocapture with tag_name and href', () => {
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                elements: [
                    {
                        "text": "Heatmaps",
                        "tag_name": "a",
                        "href": "/docs/user-guides/toolbar",
                    }
                ]
            },
        })
        const { eventDetails } = buildDefinition({
            event: '$autocapture',
            tag_name: 'a',
            href: '/docs/user-guides/toolbar',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('does not match autocapture with wrong href', () => {
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                elements: [
                    {
                        "tag_name": "a",
                        "href": "/some-random-site",
                    }
                ]
            },
        })
        const { eventDetails } = buildDefinition({
            event: '$autocapture',
            tag_name: 'a',
            href: '/docs/user-guides/toolbar',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(false)
    })
    test('does not match autocapture with wrong DOM tree', () => {
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                elements: [
                    {
                        "tag_name": "span",
                        "text": "some irrelevant text"
                    },
                    {
                        "tag_name": "div",
                    }
                ]
            },
        })
        const { eventDetails } = buildDefinition({
            event: '$autocapture',
            tag_name: 'a',
            href: '/docs/user-guides/toolbar',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(false)
    })
    test('matches autocapture with exact text match', () => {
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                elements: [
                    {
                        "text": "Heatmaps",
                        "tag_name": "a",
                        "href": "/docs/user-guides/toolbar",
                    }
                ]
            },
        })
        const { eventDetails } = buildDefinition({
            event: '$autocapture',
            text: 'Heatmaps',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('fails autocapture by selector', () => {
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                elements: [
                    {
                        "text": "Heatmaps",
                        "tag_name": "a",
                        "href": "/docs/user-guides/toolbar",
                    },
                    {
                        "tag_name": "div",
                    }
                ]
            },
        })
        const { eventDetails } = buildDefinition({
            event: '$autocapture',
            href: '/docs/user-guides/toolbar',
            selector: 'div > a',
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(false)
    })
})

describe('eventMatchesDefinition - url_matching', () => {
    test('matches $current_url with exact', () => {
        const event = buildEvent({
        event: 'custom_event_name',
            properties: {
                $current_url: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            url: 'https://www.example.com/some-page',
            url_matching: 'exact' as ActionStepUrlMatching.Exact,
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('matches $current_url with contains', () => {
        const event = buildEvent({
        event: 'custom_event_name',
            properties: {
                $current_url: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            url: '/some-page',
            url_matching: 'contains' as ActionStepUrlMatching.Contains,
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('matches $current_url with regex', () => {
        const event = buildEvent({
        event: 'custom_event_name',
            properties: {
                $current_url: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            url: 'https?:\/\/(w)+',
            url_matching: 'regex' as ActionStepUrlMatching.Regex,
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
})

describe('eventMatchesDefinition - properties', () => {
    test('matches on custom_property', () => {
        const event = buildEvent({
            event: 'custom_event_name',
            properties: {
                custom_property: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            properties: [
                {
                    key: 'custom_property',
                    operator: 'exact' as PropertyOperator.Exact,
                    type: 'event',
                    value: 'https://www.example.com/some-page',
                }
            ]
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
    test('does not match on custom_property with wrong value', () => {
        const event = buildEvent({
            event: 'custom_event_name',
            properties: {
                custom_property: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            properties: [
                {
                    key: 'custom_property',
                    operator: 'exact' as PropertyOperator.Exact,
                    type: 'event',
                    value: 'https://www.example.com/page-2',
                }
            ]
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(false)
    })
    test('matches on custom_property with icontains operator', () => {
        const event = buildEvent({
            event: 'custom_event_name',
            properties: {
                custom_property: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            properties: [
                {
                    key: 'custom_property',
                    operator: 'icontains' as PropertyOperator.IContains,
                    type: 'event',
                    value: '/some-page',
                }
            ]
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    }),
    test('matches on custom_property with icontains as array operator', () => {
        const event = buildEvent({
            event: 'custom_event_name',
            properties: {
                custom_property: 'https://www.example.com/some-page',
            },
        })
        const { eventDetails } = buildDefinition({
            event: 'custom_event_name',
            properties: [
                {
                    key: 'custom_property',
                    operator: 'icontains' as PropertyOperator.IContains,
                    type: 'event',
                    value: ['/some-page', '/another-page'],
                }
            ]
        }, 'some_conversion')
        expect(eventMatchesDefinition(event, eventDetails)).toBe(true)
    })
})

describe('formatTimestampForGoogle', () => {
    test('formats timestamp +00:00 -> +0000', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09T21:58:36.973000+00:00')
        expect(timestamp).toBe('2021-11-09T21:58:36.973000+0000')
    })
    test('formats timestamp +00 -> +0000', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09T21:58:36.973000+00')
        expect(timestamp).toBe('2021-11-09T21:58:36.973000+0000')
    })
    test('formats timestamp Z -> +0000', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09T21:58:36.973Z')
        expect(timestamp).toBe('2021-11-09T21:58:36.973+0000')
    })
    test('passes unknown format through without modification', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09')
        expect(timestamp).toBe('2021-11-09')
    })
})

describe('getConversionEventData', () => {
    test('returns data for pageview with gclid', () => {
        const testDate = new Date('2021-11-09').toISOString()
        const event = buildEvent({
            event: '$pageview',
            properties: {
                gclid: 'abcdef0123456',
                $current_url: 'https://www.example.com/some-page',
            },
            timestamp: testDate,
        })
        const definition = buildDefinition({
            event: '$pageview',
            url: '/some-page',
            url_matching: 'contains' as ActionStepUrlMatching.Contains,
        }, 'some_conversion')
        const data = getConversionEventData(event, ['$pageview'], [definition])
        expect(data).toEqual({
            gclid: 'abcdef0123456',
            conversionName: 'some_conversion',
            timestamp: formatTimestampForGoogle(testDate),
        })
    })
    test('returns data when given multiple definitions', () => {
        const testDate = new Date('2021-11-09').toISOString()
        const event = buildEvent({
            event: '$pageview',
            properties: {
                gclid: 'abcdef0123456',
                $current_url: 'https://www.example.com/some-page',
            },
            timestamp: testDate,
        })
        const definitionsFromActionSteps = [
            buildDefinition({
                event: '$pageview',
                url: '/some-other-page',
                url_matching: 'contains' as ActionStepUrlMatching.Contains,
            }, 'some_conversion'),
            buildDefinition({
                event: '$pageview',
                url: '/some-page',
                url_matching: 'contains' as ActionStepUrlMatching.Contains,
            }, 'some_conversion')
        ]
        const data = getConversionEventData(event, ['$pageview'], definitionsFromActionSteps)
        expect(data).toEqual({
            gclid: 'abcdef0123456',
            conversionName: 'some_conversion',
            timestamp: formatTimestampForGoogle(testDate),
        })
    })
    test('returns null if gclid not set', () => {
        const testDate = new Date('2021-11-09').toISOString()
        const event = buildEvent({
            event: '$pageview',
            properties: {
                $current_url: 'https://www.example.com/some-page',
            },
            timestamp: testDate,
        })
        const definition = buildDefinition({
            event: '$pageview',
            url: '/some-page',
            url_matching: 'contains' as ActionStepUrlMatching.Contains,
        }, 'some_conversion')
        const data = getConversionEventData(event, ['$pageview'], [definition])
        expect(data).toBeNull()
    })
    test('returns data for autocapture with gclid', () => {
        const testDate = new Date('2021-11-09').toISOString()
        const event = buildEvent({
            event: '$autocapture',
            properties: {
                gclid: 'abcdef0123456',
                $current_url: 'https://www.example.com/some-page',
                elements: [
                    {
                        "text": "Heatmaps",
                        "tag_name": "a",
                        "href": "/docs/user-guides/toolbar",
                    }
                ],
            },
            timestamp: testDate,
        })
        const definition = buildDefinition({
            event: '$autocapture',
            url: '/some-page',
            url_matching: 'contains' as ActionStepUrlMatching.Contains,
            text: 'Heatmaps',
            tag_name: 'a',
        }, 'some_conversion')
        const data = getConversionEventData(event, ['$autocapture'], [definition])
        expect(data).toEqual({
            gclid: 'abcdef0123456',
            conversionName: 'some_conversion',
            timestamp: formatTimestampForGoogle(testDate),
        })
    })
})
