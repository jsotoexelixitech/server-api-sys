import type {
  OriginDbAdapter,
  OriginQueryResult,
} from './origin-adapter.types';

/** Stub: oracledb package is not in server-api-sys dependencies. */
export class OracleOriginAdapter implements OriginDbAdapter {
  async connect(): Promise<void> {
    throw new Error(
      'Oracle origin adapter not available — oracledb package is not installed',
    );
  }

  async executeQuery(): Promise<OriginQueryResult> {
    return {
      error: true,
      message:
        'Oracle origin adapter not available — oracledb package is not installed',
    };
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}
