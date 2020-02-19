import * as assert from 'assert'
import { compareVersion } from './versions'

describe('compareVersions', () => {
    it('should return enabledForDev flag when product version is dev', () => {
        for (const value of [true, false]) {
            const enabled = compareVersion({
                productVersion: 'dev',
                minimumDate: '',
                minimumVersion: '',
                enableForDev: value,
            })

            assert.equal(enabled, value)
        }
    })

    it('should return enabledForDev flag when product version is suffixed with dev', () => {
        for (const value of [true, false]) {
            const enabled = compareVersion({
                productVersion: 'test-user-dev',
                minimumDate: '',
                minimumVersion: '',
                enableForDev: value,
            })

            assert.equal(enabled, value)
        }
    })

    it('should compare semantic versions', () => {
        const tests: {
            productVersion: string
            enabled: boolean
        }[] = [
            {
                productVersion: '1.2.3',
                enabled: true,
            },
            {
                productVersion: '1.2.4',
                enabled: true,
            },
            {
                productVersion: '1.2.2',
                enabled: false,
            },
        ]

        for (const test of tests) {
            const enabled = compareVersion({
                productVersion: test.productVersion,
                minimumDate: '',
                minimumVersion: '1.2.3',
            })

            assert.equal(enabled, test.enabled)
        }
    })

    it('should compare semantic versions with rc tags', () => {
        const tests: {
            productVersion: string
            enabled: boolean
        }[] = [
            {
                productVersion: '1.2.3-rc.1',
                enabled: true,
            },
            {
                productVersion: '1.2.4-rc.1',
                enabled: true,
            },
            {
                productVersion: '1.2.2-rc.1',
                enabled: false,
            },
        ]

        for (const test of tests) {
            const enabled = compareVersion({
                productVersion: test.productVersion,
                minimumDate: '',
                minimumVersion: '1.2.3',
            })

            assert.equal(enabled, test.enabled)
        }
    })

    it('should compare build strings', () => {
        const tests: {
            productVersion: string
            enabled: boolean
        }[] = [
            {
                productVersion: '12345_2019-12-04_deadbee',
                enabled: true,
            },
            {
                productVersion: '12345_2019-12-05_deadbee',
                enabled: true,
            },
            {
                productVersion: '12345_2019-12-03_deadbee',
                enabled: false,
            },
        ]

        for (const test of tests) {
            const enabled = compareVersion({
                productVersion: test.productVersion,
                minimumDate: '2019-12-04',
                minimumVersion: '',
            })

            assert.equal(enabled, test.enabled)
        }
    })
})
