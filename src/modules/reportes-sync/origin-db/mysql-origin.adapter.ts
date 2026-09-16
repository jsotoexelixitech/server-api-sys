import type {
  OriginDbAdapter,
  OriginQueryResult,
} from './origin-adapter.types';

/** Stub: mysql2 package is not in server-api-sys dependencies. */
export class MysqlOriginAdapter implements OriginDbAdapter {
  async connect(): Promise<void> {
    throw new Error(
      'MySQL origin adapter not available — mysql2 package is not installed',
    );
  }

  async executeQuery(): Promise<OriginQueryResult> {
    return {
      error: true,
      message:
        'MySQL origin adapter not available — mysql2 package is not installed',
    };
  }

  async disconnect(): Promise<void> {
    // no-op
  }
}
