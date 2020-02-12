import { isEqual, pick } from 'lodash'
import { from, Observable } from 'rxjs'
import { distinctUntilChanged, finalize, map } from 'rxjs/operators'
import * as sourcegraph from 'sourcegraph'

export function reregisterOnChange<T extends object>(
    o: Observable<T>,
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

    return from(o)
        .pipe(
            distinctUntilChanged((x, y) =>
                reloadOnValues !== undefined
                    ? isEqual(pick(x, reloadOnValues), pick(y, reloadOnValues))
                    : isEqual(x, y)
            ),
            map(v => {
                unsubscribe()
                registration = register(v)
            }),
            finalize(unsubscribe)
        )
        .subscribe()
}
