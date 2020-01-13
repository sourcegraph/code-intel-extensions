import * as semver from 'semver'

/**
 * Compare a product version against a minimum product version
 * or build date. The minimum product version should be a semantic
 * version. The minimum build date should be a YYYY-MM-DD string.
 *
 * The supplied minimums should be the version or date for which
 * a feature is **guaranteed** to be available. This is especially
 * necessary for dates, where where releases earlier in the day
 * may not have the feature, but releases later in the day do. In
 * this case, the minimum date should be the day after the feature
 * was introduced.
 *
 * @param args Parameter bag.
 */
export function compareVersion({
    productVersion,
    minimumDate,
    minimumVersion,
    enableForDev = true,
}: {
    /** The current product version. */
    productVersion: string
    /** The minimum date of the build string. */
    minimumDate: string
    /** THe minimum release version. */
    minimumVersion: string
    /** Whether to return true in development. */
    enableForDev?: boolean
}): boolean {
    if (productVersion === 'dev') {
        return enableForDev
    }

    if (semver.valid(productVersion)) {
        return semver.satisfies(productVersion, `>=${minimumVersion}`)
    }

    const m = productVersion.match(/^\d+_(\d{4}-\d{2}-\d{2})_[a-z0-9]{7}$/)
    if (m === null) {
        throw new Error(`Unexpected product version '${productVersion}'.`)
    }

    return m[1].localeCompare(minimumDate) >= 0
}
