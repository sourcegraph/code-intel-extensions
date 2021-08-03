// Stub Sourcegraph API
import { createStubSourcegraphAPI } from '@sourcegraph/extension-api-stubs'
import mock from 'mock-require'
mock('sourcegraph', createStubSourcegraphAPI())
