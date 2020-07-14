// import * as assert from 'assert'
import { BehaviorSubject } from 'rxjs'
import * as sinon from 'sinon'
import * as sourcegraph from 'sourcegraph'
import { reregisterOnChange } from './util'

describe('reregisterOnChange', () => {
    interface TestSettings {
        foo: string
        bar: string
        baz: string
    }

    it('should register with initial values', () => {
        const register = sinon.spy<(value: TestSettings) => sourcegraph.Unsubscribable>(() => ({
            unsubscribe: () => {
                /* noop */
            },
        }))

        const o = new BehaviorSubject<TestSettings>({
            foo: 'foo',
            bar: 'bar',
            baz: 'baz',
        })

        reregisterOnChange(o, [], register)
        sinon.assert.calledWith(register, {
            foo: 'foo',
            bar: 'bar',
            baz: 'baz',
        })
    })

    it('should register with changed values', () => {
        const register = sinon.spy<(value: TestSettings) => sourcegraph.Unsubscribable>(() => ({
            unsubscribe: () => {
                /* noop */
            },
        }))

        const o = new BehaviorSubject<TestSettings>({
            foo: 'foo1',
            bar: 'bar2',
            baz: 'baz3',
        })

        reregisterOnChange(o, ['foo', 'bar', 'baz'], register)
        o.next({ foo: 'foo4', bar: 'bar5', baz: 'baz6' })

        sinon.assert.callCount(register, 2)
        sinon.assert.calledWith(register, {
            foo: 'foo4',
            bar: 'bar5',
            baz: 'baz6',
        })
    })

    it('should register only with whitelisted changes', () => {
        const register = sinon.spy<(value: TestSettings) => sourcegraph.Unsubscribable>(() => ({
            unsubscribe: () => {
                /* noop */
            },
        }))

        const o = new BehaviorSubject<TestSettings>({
            foo: 'foo1',
            bar: 'bar2',
            baz: 'baz3',
        })

        reregisterOnChange(o, ['bar'], register)
        o.next({ foo: 'foo4', bar: 'bar2', baz: 'baz4' })
        o.next({ foo: 'foo5', bar: 'bar3', baz: 'baz5' })
        o.next({ foo: 'foo6', bar: 'bar3', baz: 'baz6' })

        sinon.assert.callCount(register, 2)
        sinon.assert.calledWith(register, {
            foo: 'foo5',
            bar: 'bar3',
            baz: 'baz5',
        })
    })

    it('should unsubscribe', () => {
        const unsub1 = sinon.spy<() => void>(() => {
            /* no-op */
        })
        const unsub2 = sinon.spy<() => void>(() => {
            /* no-op */
        })
        const unsub3 = sinon.spy<() => void>(() => {
            /* no-op */
        })

        const register = sinon.stub()
        register.onCall(0).returns({ unsubscribe: unsub1 })
        register.onCall(1).returns({ unsubscribe: unsub2 })
        register.onCall(2).returns({ unsubscribe: unsub3 })

        const o = new BehaviorSubject<TestSettings>({
            foo: 'foo',
            bar: '',
            baz: '',
        })

        const unsub4 = reregisterOnChange(o, ['foo'], register)
        o.next({ foo: 'foo', bar: '', baz: '' })
        o.next({ foo: 'bar', bar: '', baz: '' })
        o.next({ foo: 'baz', bar: '', baz: '' })

        sinon.assert.callCount(register, 3)
        sinon.assert.calledOnce(unsub1)
        sinon.assert.calledOnce(unsub2)
        sinon.assert.notCalled(unsub3)

        unsub4.unsubscribe()
        sinon.assert.calledOnce(unsub3)
    })
})
