import { isEqual, pick } from 'lodash'
import { from, Observable } from 'rxjs'
import { distinctUntilChanged, finalize, map } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'

export function reregisterOnChange<T extends object>(
    observable: Observable<T>,
    reloadOnValues: (keyof T)[] | undefined,
    register: (value: T) => sourcegraph.Unsubscribable
): sourcegraph.Unsubscribable {
    let registration: sourcegraph.Unsubscribable | undefined

    const unsubscribe = (): void => {
        if (registration) {
            registration.unsubscribe()
            registration = undefined
        }
    }

    return from(observable)
        .pipe(
            distinctUntilChanged((previous, next) =>
                reloadOnValues !== undefined ? isEqual(pick(previous, reloadOnValues), pick(next, reloadOnValues)) : isEqual(previous,next)
            ),
            map(value => {
                unsubscribe()
                registration = register(value)
            }),
            finalize(unsubscribe)
        )
        .subscribe()
}
