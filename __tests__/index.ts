import { createEvent, createPageview } from '@posthog/plugin-scaffold/test/utils'
import { matchValue, PropertyOperator, ActionStepUrlMatching } from '../index'

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
