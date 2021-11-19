import {
    formatTimestampForGoogle,
} from '../index'


describe('formatTimestampForGoogle', () => {
    test('formats timestamp +00:00 -> +0000', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09T21:58:36.973000+00:00')
        expect(timestamp).toBe('2021-11-09T21:58:36+0000')
    })
    test('formats timestamp Z -> +0000', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09T21:58:36.973Z')
        expect(timestamp).toBe('2021-11-09T21:58:36+0000')
    })
    test('formats when smaller units are unknown', () => {
        const timestamp = formatTimestampForGoogle('2021-11-09')
        expect(timestamp).toBe('2021-11-09T00:00:00+0000')
    })
    test('passes unknown format through unchanged', () => {
        console.warn = jest.fn()
        const timestamp = formatTimestampForGoogle('four score and seven years ago')
        expect(timestamp).toBe('four score and seven years ago')
        expect(console.warn).toHaveBeenCalled()
    })
})
