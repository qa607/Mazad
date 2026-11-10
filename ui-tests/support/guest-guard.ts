/**
 * The UI layer's guest guard. The implementation moved to src/network/request-guard.ts so the
 * Web functional tests use the same guard; the UI layer passes no approved endpoints.
 */
export * from '../../src/network/request-guard';
