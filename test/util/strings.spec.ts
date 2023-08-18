import { startAndEndsWith } from '../../src/util/strings'
import { assert } from 'chai'

describe('Strings', () => {
	describe('startAndEndsWith', () => {
		describe('positive', () => {
			const positive = (str: string, letter: string): void => {
				it(`${str} with ${letter}`, () => {
					assert.isTrue(startAndEndsWith(str, letter), `${str} should start and end with ${letter}`)
				})
			}
			positive('""', '"')
			positive('AnnA', 'A')
			positive('PalindromeemordnilaP', 'P')
		})
		describe('negative', () => {
			const negative = (str: string, letter: string): void => {
				it(`${str} with ${letter}`, () => {
					assert.isFalse(startAndEndsWith(str, letter), `${str} should not start and end with ${letter}`)
				})
			}
			negative('Anna', 'A')
			negative('annA', 'A')
			negative('Walter', 'W')
			negative('Timo', 'o')
		})
		describe('illegal inputs', () => {
			it('throw for empty string', () => {
				assert.throws(() => startAndEndsWith('', 'A'), Error)
			})
			it('throw for one-letter string', () => {
				assert.throws(() => startAndEndsWith('A', 'A'), Error)
			})
			it('throw for non-char string', () => {
				assert.throws(() => startAndEndsWith('HeHe', 'He'), Error)
			})
		})
	})
})
