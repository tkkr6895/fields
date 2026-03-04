declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  interface Database {
    exec(sql: string): QueryExecResult[];
    close(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface InitSqlJsStatic {
    (config?: Record<string, unknown>): Promise<SqlJsStatic>;
  }

  const initSqlJs: InitSqlJsStatic;
  export default initSqlJs;
}
