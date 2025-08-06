
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model Law
 * 
 */
export type Law = $Result.DefaultSelection<Prisma.$LawPayload>
/**
 * Model Article
 * 
 */
export type Article = $Result.DefaultSelection<Prisma.$ArticlePayload>
/**
 * Model Paragraph
 * 
 */
export type Paragraph = $Result.DefaultSelection<Prisma.$ParagraphPayload>
/**
 * Model Item
 * 
 */
export type Item = $Result.DefaultSelection<Prisma.$ItemPayload>

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Laws
 * const laws = await prisma.law.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more Laws
   * const laws = await prisma.law.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.law`: Exposes CRUD operations for the **Law** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Laws
    * const laws = await prisma.law.findMany()
    * ```
    */
  get law(): Prisma.LawDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.article`: Exposes CRUD operations for the **Article** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Articles
    * const articles = await prisma.article.findMany()
    * ```
    */
  get article(): Prisma.ArticleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.paragraph`: Exposes CRUD operations for the **Paragraph** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Paragraphs
    * const paragraphs = await prisma.paragraph.findMany()
    * ```
    */
  get paragraph(): Prisma.ParagraphDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.item`: Exposes CRUD operations for the **Item** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Items
    * const items = await prisma.item.findMany()
    * ```
    */
  get item(): Prisma.ItemDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.13.0
   * Query Engine version: 361e86d0ea4987e9f53a565309b3eed797a6bcbd
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    Law: 'Law',
    Article: 'Article',
    Paragraph: 'Paragraph',
    Item: 'Item'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "law" | "article" | "paragraph" | "item"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Law: {
        payload: Prisma.$LawPayload<ExtArgs>
        fields: Prisma.LawFieldRefs
        operations: {
          findUnique: {
            args: Prisma.LawFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.LawFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          findFirst: {
            args: Prisma.LawFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.LawFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          findMany: {
            args: Prisma.LawFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>[]
          }
          create: {
            args: Prisma.LawCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          createMany: {
            args: Prisma.LawCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.LawCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>[]
          }
          delete: {
            args: Prisma.LawDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          update: {
            args: Prisma.LawUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          deleteMany: {
            args: Prisma.LawDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.LawUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.LawUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>[]
          }
          upsert: {
            args: Prisma.LawUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$LawPayload>
          }
          aggregate: {
            args: Prisma.LawAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateLaw>
          }
          groupBy: {
            args: Prisma.LawGroupByArgs<ExtArgs>
            result: $Utils.Optional<LawGroupByOutputType>[]
          }
          count: {
            args: Prisma.LawCountArgs<ExtArgs>
            result: $Utils.Optional<LawCountAggregateOutputType> | number
          }
        }
      }
      Article: {
        payload: Prisma.$ArticlePayload<ExtArgs>
        fields: Prisma.ArticleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ArticleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ArticleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          findFirst: {
            args: Prisma.ArticleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ArticleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          findMany: {
            args: Prisma.ArticleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>[]
          }
          create: {
            args: Prisma.ArticleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          createMany: {
            args: Prisma.ArticleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ArticleCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>[]
          }
          delete: {
            args: Prisma.ArticleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          update: {
            args: Prisma.ArticleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          deleteMany: {
            args: Prisma.ArticleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ArticleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ArticleUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>[]
          }
          upsert: {
            args: Prisma.ArticleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ArticlePayload>
          }
          aggregate: {
            args: Prisma.ArticleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateArticle>
          }
          groupBy: {
            args: Prisma.ArticleGroupByArgs<ExtArgs>
            result: $Utils.Optional<ArticleGroupByOutputType>[]
          }
          count: {
            args: Prisma.ArticleCountArgs<ExtArgs>
            result: $Utils.Optional<ArticleCountAggregateOutputType> | number
          }
        }
      }
      Paragraph: {
        payload: Prisma.$ParagraphPayload<ExtArgs>
        fields: Prisma.ParagraphFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ParagraphFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ParagraphFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          findFirst: {
            args: Prisma.ParagraphFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ParagraphFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          findMany: {
            args: Prisma.ParagraphFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>[]
          }
          create: {
            args: Prisma.ParagraphCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          createMany: {
            args: Prisma.ParagraphCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ParagraphCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>[]
          }
          delete: {
            args: Prisma.ParagraphDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          update: {
            args: Prisma.ParagraphUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          deleteMany: {
            args: Prisma.ParagraphDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ParagraphUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ParagraphUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>[]
          }
          upsert: {
            args: Prisma.ParagraphUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ParagraphPayload>
          }
          aggregate: {
            args: Prisma.ParagraphAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateParagraph>
          }
          groupBy: {
            args: Prisma.ParagraphGroupByArgs<ExtArgs>
            result: $Utils.Optional<ParagraphGroupByOutputType>[]
          }
          count: {
            args: Prisma.ParagraphCountArgs<ExtArgs>
            result: $Utils.Optional<ParagraphCountAggregateOutputType> | number
          }
        }
      }
      Item: {
        payload: Prisma.$ItemPayload<ExtArgs>
        fields: Prisma.ItemFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ItemFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ItemFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          findFirst: {
            args: Prisma.ItemFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ItemFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          findMany: {
            args: Prisma.ItemFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>[]
          }
          create: {
            args: Prisma.ItemCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          createMany: {
            args: Prisma.ItemCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ItemCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>[]
          }
          delete: {
            args: Prisma.ItemDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          update: {
            args: Prisma.ItemUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          deleteMany: {
            args: Prisma.ItemDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ItemUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ItemUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>[]
          }
          upsert: {
            args: Prisma.ItemUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ItemPayload>
          }
          aggregate: {
            args: Prisma.ItemAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateItem>
          }
          groupBy: {
            args: Prisma.ItemGroupByArgs<ExtArgs>
            result: $Utils.Optional<ItemGroupByOutputType>[]
          }
          count: {
            args: Prisma.ItemCountArgs<ExtArgs>
            result: $Utils.Optional<ItemCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    law?: LawOmit
    article?: ArticleOmit
    paragraph?: ParagraphOmit
    item?: ItemOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type LawCountOutputType
   */

  export type LawCountOutputType = {
    articles: number
  }

  export type LawCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    articles?: boolean | LawCountOutputTypeCountArticlesArgs
  }

  // Custom InputTypes
  /**
   * LawCountOutputType without action
   */
  export type LawCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the LawCountOutputType
     */
    select?: LawCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * LawCountOutputType without action
   */
  export type LawCountOutputTypeCountArticlesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ArticleWhereInput
  }


  /**
   * Count Type ArticleCountOutputType
   */

  export type ArticleCountOutputType = {
    paragraphs: number
  }

  export type ArticleCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    paragraphs?: boolean | ArticleCountOutputTypeCountParagraphsArgs
  }

  // Custom InputTypes
  /**
   * ArticleCountOutputType without action
   */
  export type ArticleCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ArticleCountOutputType
     */
    select?: ArticleCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ArticleCountOutputType without action
   */
  export type ArticleCountOutputTypeCountParagraphsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ParagraphWhereInput
  }


  /**
   * Count Type ParagraphCountOutputType
   */

  export type ParagraphCountOutputType = {
    items: number
  }

  export type ParagraphCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    items?: boolean | ParagraphCountOutputTypeCountItemsArgs
  }

  // Custom InputTypes
  /**
   * ParagraphCountOutputType without action
   */
  export type ParagraphCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ParagraphCountOutputType
     */
    select?: ParagraphCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ParagraphCountOutputType without action
   */
  export type ParagraphCountOutputTypeCountItemsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ItemWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Law
   */

  export type AggregateLaw = {
    _count: LawCountAggregateOutputType | null
    _min: LawMinAggregateOutputType | null
    _max: LawMaxAggregateOutputType | null
  }

  export type LawMinAggregateOutputType = {
    id: string | null
    title: string | null
    lawType: string | null
    lawNumber: string | null
    promulgationDate: Date | null
    effectiveDate: Date | null
    xmlContent: string | null
    status: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LawMaxAggregateOutputType = {
    id: string | null
    title: string | null
    lawType: string | null
    lawNumber: string | null
    promulgationDate: Date | null
    effectiveDate: Date | null
    xmlContent: string | null
    status: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type LawCountAggregateOutputType = {
    id: number
    title: number
    lawType: number
    lawNumber: number
    promulgationDate: number
    effectiveDate: number
    xmlContent: number
    status: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type LawMinAggregateInputType = {
    id?: true
    title?: true
    lawType?: true
    lawNumber?: true
    promulgationDate?: true
    effectiveDate?: true
    xmlContent?: true
    status?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LawMaxAggregateInputType = {
    id?: true
    title?: true
    lawType?: true
    lawNumber?: true
    promulgationDate?: true
    effectiveDate?: true
    xmlContent?: true
    status?: true
    createdAt?: true
    updatedAt?: true
  }

  export type LawCountAggregateInputType = {
    id?: true
    title?: true
    lawType?: true
    lawNumber?: true
    promulgationDate?: true
    effectiveDate?: true
    xmlContent?: true
    status?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type LawAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Law to aggregate.
     */
    where?: LawWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Laws to fetch.
     */
    orderBy?: LawOrderByWithRelationInput | LawOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: LawWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Laws from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Laws.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Laws
    **/
    _count?: true | LawCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: LawMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: LawMaxAggregateInputType
  }

  export type GetLawAggregateType<T extends LawAggregateArgs> = {
        [P in keyof T & keyof AggregateLaw]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateLaw[P]>
      : GetScalarType<T[P], AggregateLaw[P]>
  }




  export type LawGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: LawWhereInput
    orderBy?: LawOrderByWithAggregationInput | LawOrderByWithAggregationInput[]
    by: LawScalarFieldEnum[] | LawScalarFieldEnum
    having?: LawScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: LawCountAggregateInputType | true
    _min?: LawMinAggregateInputType
    _max?: LawMaxAggregateInputType
  }

  export type LawGroupByOutputType = {
    id: string
    title: string
    lawType: string | null
    lawNumber: string | null
    promulgationDate: Date | null
    effectiveDate: Date | null
    xmlContent: string
    status: string
    createdAt: Date
    updatedAt: Date
    _count: LawCountAggregateOutputType | null
    _min: LawMinAggregateOutputType | null
    _max: LawMaxAggregateOutputType | null
  }

  type GetLawGroupByPayload<T extends LawGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<LawGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof LawGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], LawGroupByOutputType[P]>
            : GetScalarType<T[P], LawGroupByOutputType[P]>
        }
      >
    >


  export type LawSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    lawType?: boolean
    lawNumber?: boolean
    promulgationDate?: boolean
    effectiveDate?: boolean
    xmlContent?: boolean
    status?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    articles?: boolean | Law$articlesArgs<ExtArgs>
    _count?: boolean | LawCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["law"]>

  export type LawSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    lawType?: boolean
    lawNumber?: boolean
    promulgationDate?: boolean
    effectiveDate?: boolean
    xmlContent?: boolean
    status?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["law"]>

  export type LawSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    title?: boolean
    lawType?: boolean
    lawNumber?: boolean
    promulgationDate?: boolean
    effectiveDate?: boolean
    xmlContent?: boolean
    status?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["law"]>

  export type LawSelectScalar = {
    id?: boolean
    title?: boolean
    lawType?: boolean
    lawNumber?: boolean
    promulgationDate?: boolean
    effectiveDate?: boolean
    xmlContent?: boolean
    status?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type LawOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "title" | "lawType" | "lawNumber" | "promulgationDate" | "effectiveDate" | "xmlContent" | "status" | "createdAt" | "updatedAt", ExtArgs["result"]["law"]>
  export type LawInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    articles?: boolean | Law$articlesArgs<ExtArgs>
    _count?: boolean | LawCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type LawIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type LawIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $LawPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Law"
    objects: {
      articles: Prisma.$ArticlePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      title: string
      lawType: string | null
      lawNumber: string | null
      promulgationDate: Date | null
      effectiveDate: Date | null
      xmlContent: string
      status: string
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["law"]>
    composites: {}
  }

  type LawGetPayload<S extends boolean | null | undefined | LawDefaultArgs> = $Result.GetResult<Prisma.$LawPayload, S>

  type LawCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<LawFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: LawCountAggregateInputType | true
    }

  export interface LawDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Law'], meta: { name: 'Law' } }
    /**
     * Find zero or one Law that matches the filter.
     * @param {LawFindUniqueArgs} args - Arguments to find a Law
     * @example
     * // Get one Law
     * const law = await prisma.law.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends LawFindUniqueArgs>(args: SelectSubset<T, LawFindUniqueArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Law that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {LawFindUniqueOrThrowArgs} args - Arguments to find a Law
     * @example
     * // Get one Law
     * const law = await prisma.law.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends LawFindUniqueOrThrowArgs>(args: SelectSubset<T, LawFindUniqueOrThrowArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Law that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawFindFirstArgs} args - Arguments to find a Law
     * @example
     * // Get one Law
     * const law = await prisma.law.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends LawFindFirstArgs>(args?: SelectSubset<T, LawFindFirstArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Law that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawFindFirstOrThrowArgs} args - Arguments to find a Law
     * @example
     * // Get one Law
     * const law = await prisma.law.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends LawFindFirstOrThrowArgs>(args?: SelectSubset<T, LawFindFirstOrThrowArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Laws that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Laws
     * const laws = await prisma.law.findMany()
     * 
     * // Get first 10 Laws
     * const laws = await prisma.law.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const lawWithIdOnly = await prisma.law.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends LawFindManyArgs>(args?: SelectSubset<T, LawFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Law.
     * @param {LawCreateArgs} args - Arguments to create a Law.
     * @example
     * // Create one Law
     * const Law = await prisma.law.create({
     *   data: {
     *     // ... data to create a Law
     *   }
     * })
     * 
     */
    create<T extends LawCreateArgs>(args: SelectSubset<T, LawCreateArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Laws.
     * @param {LawCreateManyArgs} args - Arguments to create many Laws.
     * @example
     * // Create many Laws
     * const law = await prisma.law.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends LawCreateManyArgs>(args?: SelectSubset<T, LawCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Laws and returns the data saved in the database.
     * @param {LawCreateManyAndReturnArgs} args - Arguments to create many Laws.
     * @example
     * // Create many Laws
     * const law = await prisma.law.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Laws and only return the `id`
     * const lawWithIdOnly = await prisma.law.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends LawCreateManyAndReturnArgs>(args?: SelectSubset<T, LawCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Law.
     * @param {LawDeleteArgs} args - Arguments to delete one Law.
     * @example
     * // Delete one Law
     * const Law = await prisma.law.delete({
     *   where: {
     *     // ... filter to delete one Law
     *   }
     * })
     * 
     */
    delete<T extends LawDeleteArgs>(args: SelectSubset<T, LawDeleteArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Law.
     * @param {LawUpdateArgs} args - Arguments to update one Law.
     * @example
     * // Update one Law
     * const law = await prisma.law.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends LawUpdateArgs>(args: SelectSubset<T, LawUpdateArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Laws.
     * @param {LawDeleteManyArgs} args - Arguments to filter Laws to delete.
     * @example
     * // Delete a few Laws
     * const { count } = await prisma.law.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends LawDeleteManyArgs>(args?: SelectSubset<T, LawDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Laws.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Laws
     * const law = await prisma.law.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends LawUpdateManyArgs>(args: SelectSubset<T, LawUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Laws and returns the data updated in the database.
     * @param {LawUpdateManyAndReturnArgs} args - Arguments to update many Laws.
     * @example
     * // Update many Laws
     * const law = await prisma.law.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Laws and only return the `id`
     * const lawWithIdOnly = await prisma.law.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends LawUpdateManyAndReturnArgs>(args: SelectSubset<T, LawUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Law.
     * @param {LawUpsertArgs} args - Arguments to update or create a Law.
     * @example
     * // Update or create a Law
     * const law = await prisma.law.upsert({
     *   create: {
     *     // ... data to create a Law
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Law we want to update
     *   }
     * })
     */
    upsert<T extends LawUpsertArgs>(args: SelectSubset<T, LawUpsertArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Laws.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawCountArgs} args - Arguments to filter Laws to count.
     * @example
     * // Count the number of Laws
     * const count = await prisma.law.count({
     *   where: {
     *     // ... the filter for the Laws we want to count
     *   }
     * })
    **/
    count<T extends LawCountArgs>(
      args?: Subset<T, LawCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], LawCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Law.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends LawAggregateArgs>(args: Subset<T, LawAggregateArgs>): Prisma.PrismaPromise<GetLawAggregateType<T>>

    /**
     * Group by Law.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {LawGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends LawGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: LawGroupByArgs['orderBy'] }
        : { orderBy?: LawGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, LawGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetLawGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Law model
   */
  readonly fields: LawFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Law.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__LawClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    articles<T extends Law$articlesArgs<ExtArgs> = {}>(args?: Subset<T, Law$articlesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Law model
   */
  interface LawFieldRefs {
    readonly id: FieldRef<"Law", 'String'>
    readonly title: FieldRef<"Law", 'String'>
    readonly lawType: FieldRef<"Law", 'String'>
    readonly lawNumber: FieldRef<"Law", 'String'>
    readonly promulgationDate: FieldRef<"Law", 'DateTime'>
    readonly effectiveDate: FieldRef<"Law", 'DateTime'>
    readonly xmlContent: FieldRef<"Law", 'String'>
    readonly status: FieldRef<"Law", 'String'>
    readonly createdAt: FieldRef<"Law", 'DateTime'>
    readonly updatedAt: FieldRef<"Law", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Law findUnique
   */
  export type LawFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter, which Law to fetch.
     */
    where: LawWhereUniqueInput
  }

  /**
   * Law findUniqueOrThrow
   */
  export type LawFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter, which Law to fetch.
     */
    where: LawWhereUniqueInput
  }

  /**
   * Law findFirst
   */
  export type LawFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter, which Law to fetch.
     */
    where?: LawWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Laws to fetch.
     */
    orderBy?: LawOrderByWithRelationInput | LawOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Laws.
     */
    cursor?: LawWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Laws from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Laws.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Laws.
     */
    distinct?: LawScalarFieldEnum | LawScalarFieldEnum[]
  }

  /**
   * Law findFirstOrThrow
   */
  export type LawFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter, which Law to fetch.
     */
    where?: LawWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Laws to fetch.
     */
    orderBy?: LawOrderByWithRelationInput | LawOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Laws.
     */
    cursor?: LawWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Laws from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Laws.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Laws.
     */
    distinct?: LawScalarFieldEnum | LawScalarFieldEnum[]
  }

  /**
   * Law findMany
   */
  export type LawFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter, which Laws to fetch.
     */
    where?: LawWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Laws to fetch.
     */
    orderBy?: LawOrderByWithRelationInput | LawOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Laws.
     */
    cursor?: LawWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Laws from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Laws.
     */
    skip?: number
    distinct?: LawScalarFieldEnum | LawScalarFieldEnum[]
  }

  /**
   * Law create
   */
  export type LawCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * The data needed to create a Law.
     */
    data: XOR<LawCreateInput, LawUncheckedCreateInput>
  }

  /**
   * Law createMany
   */
  export type LawCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Laws.
     */
    data: LawCreateManyInput | LawCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Law createManyAndReturn
   */
  export type LawCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * The data used to create many Laws.
     */
    data: LawCreateManyInput | LawCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Law update
   */
  export type LawUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * The data needed to update a Law.
     */
    data: XOR<LawUpdateInput, LawUncheckedUpdateInput>
    /**
     * Choose, which Law to update.
     */
    where: LawWhereUniqueInput
  }

  /**
   * Law updateMany
   */
  export type LawUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Laws.
     */
    data: XOR<LawUpdateManyMutationInput, LawUncheckedUpdateManyInput>
    /**
     * Filter which Laws to update
     */
    where?: LawWhereInput
    /**
     * Limit how many Laws to update.
     */
    limit?: number
  }

  /**
   * Law updateManyAndReturn
   */
  export type LawUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * The data used to update Laws.
     */
    data: XOR<LawUpdateManyMutationInput, LawUncheckedUpdateManyInput>
    /**
     * Filter which Laws to update
     */
    where?: LawWhereInput
    /**
     * Limit how many Laws to update.
     */
    limit?: number
  }

  /**
   * Law upsert
   */
  export type LawUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * The filter to search for the Law to update in case it exists.
     */
    where: LawWhereUniqueInput
    /**
     * In case the Law found by the `where` argument doesn't exist, create a new Law with this data.
     */
    create: XOR<LawCreateInput, LawUncheckedCreateInput>
    /**
     * In case the Law was found with the provided `where` argument, update it with this data.
     */
    update: XOR<LawUpdateInput, LawUncheckedUpdateInput>
  }

  /**
   * Law delete
   */
  export type LawDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
    /**
     * Filter which Law to delete.
     */
    where: LawWhereUniqueInput
  }

  /**
   * Law deleteMany
   */
  export type LawDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Laws to delete
     */
    where?: LawWhereInput
    /**
     * Limit how many Laws to delete.
     */
    limit?: number
  }

  /**
   * Law.articles
   */
  export type Law$articlesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    where?: ArticleWhereInput
    orderBy?: ArticleOrderByWithRelationInput | ArticleOrderByWithRelationInput[]
    cursor?: ArticleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ArticleScalarFieldEnum | ArticleScalarFieldEnum[]
  }

  /**
   * Law without action
   */
  export type LawDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Law
     */
    select?: LawSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Law
     */
    omit?: LawOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: LawInclude<ExtArgs> | null
  }


  /**
   * Model Article
   */

  export type AggregateArticle = {
    _count: ArticleCountAggregateOutputType | null
    _avg: ArticleAvgAggregateOutputType | null
    _sum: ArticleSumAggregateOutputType | null
    _min: ArticleMinAggregateOutputType | null
    _max: ArticleMaxAggregateOutputType | null
  }

  export type ArticleAvgAggregateOutputType = {
    sortOrder: number | null
  }

  export type ArticleSumAggregateOutputType = {
    sortOrder: number | null
  }

  export type ArticleMinAggregateOutputType = {
    id: string | null
    lawId: string | null
    articleNumber: string | null
    articleTitle: string | null
    content: string | null
    chapter: string | null
    section: string | null
    sortOrder: number | null
    isDeleted: boolean | null
  }

  export type ArticleMaxAggregateOutputType = {
    id: string | null
    lawId: string | null
    articleNumber: string | null
    articleTitle: string | null
    content: string | null
    chapter: string | null
    section: string | null
    sortOrder: number | null
    isDeleted: boolean | null
  }

  export type ArticleCountAggregateOutputType = {
    id: number
    lawId: number
    articleNumber: number
    articleTitle: number
    content: number
    chapter: number
    section: number
    sortOrder: number
    isDeleted: number
    _all: number
  }


  export type ArticleAvgAggregateInputType = {
    sortOrder?: true
  }

  export type ArticleSumAggregateInputType = {
    sortOrder?: true
  }

  export type ArticleMinAggregateInputType = {
    id?: true
    lawId?: true
    articleNumber?: true
    articleTitle?: true
    content?: true
    chapter?: true
    section?: true
    sortOrder?: true
    isDeleted?: true
  }

  export type ArticleMaxAggregateInputType = {
    id?: true
    lawId?: true
    articleNumber?: true
    articleTitle?: true
    content?: true
    chapter?: true
    section?: true
    sortOrder?: true
    isDeleted?: true
  }

  export type ArticleCountAggregateInputType = {
    id?: true
    lawId?: true
    articleNumber?: true
    articleTitle?: true
    content?: true
    chapter?: true
    section?: true
    sortOrder?: true
    isDeleted?: true
    _all?: true
  }

  export type ArticleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Article to aggregate.
     */
    where?: ArticleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Articles to fetch.
     */
    orderBy?: ArticleOrderByWithRelationInput | ArticleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ArticleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Articles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Articles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Articles
    **/
    _count?: true | ArticleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ArticleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ArticleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ArticleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ArticleMaxAggregateInputType
  }

  export type GetArticleAggregateType<T extends ArticleAggregateArgs> = {
        [P in keyof T & keyof AggregateArticle]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateArticle[P]>
      : GetScalarType<T[P], AggregateArticle[P]>
  }




  export type ArticleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ArticleWhereInput
    orderBy?: ArticleOrderByWithAggregationInput | ArticleOrderByWithAggregationInput[]
    by: ArticleScalarFieldEnum[] | ArticleScalarFieldEnum
    having?: ArticleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ArticleCountAggregateInputType | true
    _avg?: ArticleAvgAggregateInputType
    _sum?: ArticleSumAggregateInputType
    _min?: ArticleMinAggregateInputType
    _max?: ArticleMaxAggregateInputType
  }

  export type ArticleGroupByOutputType = {
    id: string
    lawId: string
    articleNumber: string
    articleTitle: string | null
    content: string
    chapter: string | null
    section: string | null
    sortOrder: number
    isDeleted: boolean
    _count: ArticleCountAggregateOutputType | null
    _avg: ArticleAvgAggregateOutputType | null
    _sum: ArticleSumAggregateOutputType | null
    _min: ArticleMinAggregateOutputType | null
    _max: ArticleMaxAggregateOutputType | null
  }

  type GetArticleGroupByPayload<T extends ArticleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ArticleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ArticleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ArticleGroupByOutputType[P]>
            : GetScalarType<T[P], ArticleGroupByOutputType[P]>
        }
      >
    >


  export type ArticleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    lawId?: boolean
    articleNumber?: boolean
    articleTitle?: boolean
    content?: boolean
    chapter?: boolean
    section?: boolean
    sortOrder?: boolean
    isDeleted?: boolean
    law?: boolean | LawDefaultArgs<ExtArgs>
    paragraphs?: boolean | Article$paragraphsArgs<ExtArgs>
    _count?: boolean | ArticleCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["article"]>

  export type ArticleSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    lawId?: boolean
    articleNumber?: boolean
    articleTitle?: boolean
    content?: boolean
    chapter?: boolean
    section?: boolean
    sortOrder?: boolean
    isDeleted?: boolean
    law?: boolean | LawDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["article"]>

  export type ArticleSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    lawId?: boolean
    articleNumber?: boolean
    articleTitle?: boolean
    content?: boolean
    chapter?: boolean
    section?: boolean
    sortOrder?: boolean
    isDeleted?: boolean
    law?: boolean | LawDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["article"]>

  export type ArticleSelectScalar = {
    id?: boolean
    lawId?: boolean
    articleNumber?: boolean
    articleTitle?: boolean
    content?: boolean
    chapter?: boolean
    section?: boolean
    sortOrder?: boolean
    isDeleted?: boolean
  }

  export type ArticleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "lawId" | "articleNumber" | "articleTitle" | "content" | "chapter" | "section" | "sortOrder" | "isDeleted", ExtArgs["result"]["article"]>
  export type ArticleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    law?: boolean | LawDefaultArgs<ExtArgs>
    paragraphs?: boolean | Article$paragraphsArgs<ExtArgs>
    _count?: boolean | ArticleCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ArticleIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    law?: boolean | LawDefaultArgs<ExtArgs>
  }
  export type ArticleIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    law?: boolean | LawDefaultArgs<ExtArgs>
  }

  export type $ArticlePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Article"
    objects: {
      law: Prisma.$LawPayload<ExtArgs>
      paragraphs: Prisma.$ParagraphPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      lawId: string
      articleNumber: string
      articleTitle: string | null
      content: string
      chapter: string | null
      section: string | null
      sortOrder: number
      isDeleted: boolean
    }, ExtArgs["result"]["article"]>
    composites: {}
  }

  type ArticleGetPayload<S extends boolean | null | undefined | ArticleDefaultArgs> = $Result.GetResult<Prisma.$ArticlePayload, S>

  type ArticleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ArticleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ArticleCountAggregateInputType | true
    }

  export interface ArticleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Article'], meta: { name: 'Article' } }
    /**
     * Find zero or one Article that matches the filter.
     * @param {ArticleFindUniqueArgs} args - Arguments to find a Article
     * @example
     * // Get one Article
     * const article = await prisma.article.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ArticleFindUniqueArgs>(args: SelectSubset<T, ArticleFindUniqueArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Article that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ArticleFindUniqueOrThrowArgs} args - Arguments to find a Article
     * @example
     * // Get one Article
     * const article = await prisma.article.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ArticleFindUniqueOrThrowArgs>(args: SelectSubset<T, ArticleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Article that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleFindFirstArgs} args - Arguments to find a Article
     * @example
     * // Get one Article
     * const article = await prisma.article.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ArticleFindFirstArgs>(args?: SelectSubset<T, ArticleFindFirstArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Article that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleFindFirstOrThrowArgs} args - Arguments to find a Article
     * @example
     * // Get one Article
     * const article = await prisma.article.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ArticleFindFirstOrThrowArgs>(args?: SelectSubset<T, ArticleFindFirstOrThrowArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Articles that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Articles
     * const articles = await prisma.article.findMany()
     * 
     * // Get first 10 Articles
     * const articles = await prisma.article.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const articleWithIdOnly = await prisma.article.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ArticleFindManyArgs>(args?: SelectSubset<T, ArticleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Article.
     * @param {ArticleCreateArgs} args - Arguments to create a Article.
     * @example
     * // Create one Article
     * const Article = await prisma.article.create({
     *   data: {
     *     // ... data to create a Article
     *   }
     * })
     * 
     */
    create<T extends ArticleCreateArgs>(args: SelectSubset<T, ArticleCreateArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Articles.
     * @param {ArticleCreateManyArgs} args - Arguments to create many Articles.
     * @example
     * // Create many Articles
     * const article = await prisma.article.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ArticleCreateManyArgs>(args?: SelectSubset<T, ArticleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Articles and returns the data saved in the database.
     * @param {ArticleCreateManyAndReturnArgs} args - Arguments to create many Articles.
     * @example
     * // Create many Articles
     * const article = await prisma.article.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Articles and only return the `id`
     * const articleWithIdOnly = await prisma.article.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ArticleCreateManyAndReturnArgs>(args?: SelectSubset<T, ArticleCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Article.
     * @param {ArticleDeleteArgs} args - Arguments to delete one Article.
     * @example
     * // Delete one Article
     * const Article = await prisma.article.delete({
     *   where: {
     *     // ... filter to delete one Article
     *   }
     * })
     * 
     */
    delete<T extends ArticleDeleteArgs>(args: SelectSubset<T, ArticleDeleteArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Article.
     * @param {ArticleUpdateArgs} args - Arguments to update one Article.
     * @example
     * // Update one Article
     * const article = await prisma.article.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ArticleUpdateArgs>(args: SelectSubset<T, ArticleUpdateArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Articles.
     * @param {ArticleDeleteManyArgs} args - Arguments to filter Articles to delete.
     * @example
     * // Delete a few Articles
     * const { count } = await prisma.article.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ArticleDeleteManyArgs>(args?: SelectSubset<T, ArticleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Articles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Articles
     * const article = await prisma.article.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ArticleUpdateManyArgs>(args: SelectSubset<T, ArticleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Articles and returns the data updated in the database.
     * @param {ArticleUpdateManyAndReturnArgs} args - Arguments to update many Articles.
     * @example
     * // Update many Articles
     * const article = await prisma.article.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Articles and only return the `id`
     * const articleWithIdOnly = await prisma.article.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ArticleUpdateManyAndReturnArgs>(args: SelectSubset<T, ArticleUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Article.
     * @param {ArticleUpsertArgs} args - Arguments to update or create a Article.
     * @example
     * // Update or create a Article
     * const article = await prisma.article.upsert({
     *   create: {
     *     // ... data to create a Article
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Article we want to update
     *   }
     * })
     */
    upsert<T extends ArticleUpsertArgs>(args: SelectSubset<T, ArticleUpsertArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Articles.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleCountArgs} args - Arguments to filter Articles to count.
     * @example
     * // Count the number of Articles
     * const count = await prisma.article.count({
     *   where: {
     *     // ... the filter for the Articles we want to count
     *   }
     * })
    **/
    count<T extends ArticleCountArgs>(
      args?: Subset<T, ArticleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ArticleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Article.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ArticleAggregateArgs>(args: Subset<T, ArticleAggregateArgs>): Prisma.PrismaPromise<GetArticleAggregateType<T>>

    /**
     * Group by Article.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ArticleGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ArticleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ArticleGroupByArgs['orderBy'] }
        : { orderBy?: ArticleGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ArticleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetArticleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Article model
   */
  readonly fields: ArticleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Article.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ArticleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    law<T extends LawDefaultArgs<ExtArgs> = {}>(args?: Subset<T, LawDefaultArgs<ExtArgs>>): Prisma__LawClient<$Result.GetResult<Prisma.$LawPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    paragraphs<T extends Article$paragraphsArgs<ExtArgs> = {}>(args?: Subset<T, Article$paragraphsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Article model
   */
  interface ArticleFieldRefs {
    readonly id: FieldRef<"Article", 'String'>
    readonly lawId: FieldRef<"Article", 'String'>
    readonly articleNumber: FieldRef<"Article", 'String'>
    readonly articleTitle: FieldRef<"Article", 'String'>
    readonly content: FieldRef<"Article", 'String'>
    readonly chapter: FieldRef<"Article", 'String'>
    readonly section: FieldRef<"Article", 'String'>
    readonly sortOrder: FieldRef<"Article", 'Int'>
    readonly isDeleted: FieldRef<"Article", 'Boolean'>
  }
    

  // Custom InputTypes
  /**
   * Article findUnique
   */
  export type ArticleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter, which Article to fetch.
     */
    where: ArticleWhereUniqueInput
  }

  /**
   * Article findUniqueOrThrow
   */
  export type ArticleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter, which Article to fetch.
     */
    where: ArticleWhereUniqueInput
  }

  /**
   * Article findFirst
   */
  export type ArticleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter, which Article to fetch.
     */
    where?: ArticleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Articles to fetch.
     */
    orderBy?: ArticleOrderByWithRelationInput | ArticleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Articles.
     */
    cursor?: ArticleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Articles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Articles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Articles.
     */
    distinct?: ArticleScalarFieldEnum | ArticleScalarFieldEnum[]
  }

  /**
   * Article findFirstOrThrow
   */
  export type ArticleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter, which Article to fetch.
     */
    where?: ArticleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Articles to fetch.
     */
    orderBy?: ArticleOrderByWithRelationInput | ArticleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Articles.
     */
    cursor?: ArticleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Articles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Articles.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Articles.
     */
    distinct?: ArticleScalarFieldEnum | ArticleScalarFieldEnum[]
  }

  /**
   * Article findMany
   */
  export type ArticleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter, which Articles to fetch.
     */
    where?: ArticleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Articles to fetch.
     */
    orderBy?: ArticleOrderByWithRelationInput | ArticleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Articles.
     */
    cursor?: ArticleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Articles from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Articles.
     */
    skip?: number
    distinct?: ArticleScalarFieldEnum | ArticleScalarFieldEnum[]
  }

  /**
   * Article create
   */
  export type ArticleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * The data needed to create a Article.
     */
    data: XOR<ArticleCreateInput, ArticleUncheckedCreateInput>
  }

  /**
   * Article createMany
   */
  export type ArticleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Articles.
     */
    data: ArticleCreateManyInput | ArticleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Article createManyAndReturn
   */
  export type ArticleCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * The data used to create many Articles.
     */
    data: ArticleCreateManyInput | ArticleCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Article update
   */
  export type ArticleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * The data needed to update a Article.
     */
    data: XOR<ArticleUpdateInput, ArticleUncheckedUpdateInput>
    /**
     * Choose, which Article to update.
     */
    where: ArticleWhereUniqueInput
  }

  /**
   * Article updateMany
   */
  export type ArticleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Articles.
     */
    data: XOR<ArticleUpdateManyMutationInput, ArticleUncheckedUpdateManyInput>
    /**
     * Filter which Articles to update
     */
    where?: ArticleWhereInput
    /**
     * Limit how many Articles to update.
     */
    limit?: number
  }

  /**
   * Article updateManyAndReturn
   */
  export type ArticleUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * The data used to update Articles.
     */
    data: XOR<ArticleUpdateManyMutationInput, ArticleUncheckedUpdateManyInput>
    /**
     * Filter which Articles to update
     */
    where?: ArticleWhereInput
    /**
     * Limit how many Articles to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Article upsert
   */
  export type ArticleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * The filter to search for the Article to update in case it exists.
     */
    where: ArticleWhereUniqueInput
    /**
     * In case the Article found by the `where` argument doesn't exist, create a new Article with this data.
     */
    create: XOR<ArticleCreateInput, ArticleUncheckedCreateInput>
    /**
     * In case the Article was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ArticleUpdateInput, ArticleUncheckedUpdateInput>
  }

  /**
   * Article delete
   */
  export type ArticleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
    /**
     * Filter which Article to delete.
     */
    where: ArticleWhereUniqueInput
  }

  /**
   * Article deleteMany
   */
  export type ArticleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Articles to delete
     */
    where?: ArticleWhereInput
    /**
     * Limit how many Articles to delete.
     */
    limit?: number
  }

  /**
   * Article.paragraphs
   */
  export type Article$paragraphsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    where?: ParagraphWhereInput
    orderBy?: ParagraphOrderByWithRelationInput | ParagraphOrderByWithRelationInput[]
    cursor?: ParagraphWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ParagraphScalarFieldEnum | ParagraphScalarFieldEnum[]
  }

  /**
   * Article without action
   */
  export type ArticleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Article
     */
    select?: ArticleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Article
     */
    omit?: ArticleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ArticleInclude<ExtArgs> | null
  }


  /**
   * Model Paragraph
   */

  export type AggregateParagraph = {
    _count: ParagraphCountAggregateOutputType | null
    _avg: ParagraphAvgAggregateOutputType | null
    _sum: ParagraphSumAggregateOutputType | null
    _min: ParagraphMinAggregateOutputType | null
    _max: ParagraphMaxAggregateOutputType | null
  }

  export type ParagraphAvgAggregateOutputType = {
    paragraphNumber: number | null
  }

  export type ParagraphSumAggregateOutputType = {
    paragraphNumber: number | null
  }

  export type ParagraphMinAggregateOutputType = {
    id: string | null
    articleId: string | null
    paragraphNumber: number | null
    content: string | null
  }

  export type ParagraphMaxAggregateOutputType = {
    id: string | null
    articleId: string | null
    paragraphNumber: number | null
    content: string | null
  }

  export type ParagraphCountAggregateOutputType = {
    id: number
    articleId: number
    paragraphNumber: number
    content: number
    _all: number
  }


  export type ParagraphAvgAggregateInputType = {
    paragraphNumber?: true
  }

  export type ParagraphSumAggregateInputType = {
    paragraphNumber?: true
  }

  export type ParagraphMinAggregateInputType = {
    id?: true
    articleId?: true
    paragraphNumber?: true
    content?: true
  }

  export type ParagraphMaxAggregateInputType = {
    id?: true
    articleId?: true
    paragraphNumber?: true
    content?: true
  }

  export type ParagraphCountAggregateInputType = {
    id?: true
    articleId?: true
    paragraphNumber?: true
    content?: true
    _all?: true
  }

  export type ParagraphAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Paragraph to aggregate.
     */
    where?: ParagraphWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Paragraphs to fetch.
     */
    orderBy?: ParagraphOrderByWithRelationInput | ParagraphOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ParagraphWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Paragraphs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Paragraphs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Paragraphs
    **/
    _count?: true | ParagraphCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ParagraphAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ParagraphSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ParagraphMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ParagraphMaxAggregateInputType
  }

  export type GetParagraphAggregateType<T extends ParagraphAggregateArgs> = {
        [P in keyof T & keyof AggregateParagraph]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateParagraph[P]>
      : GetScalarType<T[P], AggregateParagraph[P]>
  }




  export type ParagraphGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ParagraphWhereInput
    orderBy?: ParagraphOrderByWithAggregationInput | ParagraphOrderByWithAggregationInput[]
    by: ParagraphScalarFieldEnum[] | ParagraphScalarFieldEnum
    having?: ParagraphScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ParagraphCountAggregateInputType | true
    _avg?: ParagraphAvgAggregateInputType
    _sum?: ParagraphSumAggregateInputType
    _min?: ParagraphMinAggregateInputType
    _max?: ParagraphMaxAggregateInputType
  }

  export type ParagraphGroupByOutputType = {
    id: string
    articleId: string
    paragraphNumber: number
    content: string
    _count: ParagraphCountAggregateOutputType | null
    _avg: ParagraphAvgAggregateOutputType | null
    _sum: ParagraphSumAggregateOutputType | null
    _min: ParagraphMinAggregateOutputType | null
    _max: ParagraphMaxAggregateOutputType | null
  }

  type GetParagraphGroupByPayload<T extends ParagraphGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ParagraphGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ParagraphGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ParagraphGroupByOutputType[P]>
            : GetScalarType<T[P], ParagraphGroupByOutputType[P]>
        }
      >
    >


  export type ParagraphSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    articleId?: boolean
    paragraphNumber?: boolean
    content?: boolean
    article?: boolean | ArticleDefaultArgs<ExtArgs>
    items?: boolean | Paragraph$itemsArgs<ExtArgs>
    _count?: boolean | ParagraphCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["paragraph"]>

  export type ParagraphSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    articleId?: boolean
    paragraphNumber?: boolean
    content?: boolean
    article?: boolean | ArticleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["paragraph"]>

  export type ParagraphSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    articleId?: boolean
    paragraphNumber?: boolean
    content?: boolean
    article?: boolean | ArticleDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["paragraph"]>

  export type ParagraphSelectScalar = {
    id?: boolean
    articleId?: boolean
    paragraphNumber?: boolean
    content?: boolean
  }

  export type ParagraphOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "articleId" | "paragraphNumber" | "content", ExtArgs["result"]["paragraph"]>
  export type ParagraphInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    article?: boolean | ArticleDefaultArgs<ExtArgs>
    items?: boolean | Paragraph$itemsArgs<ExtArgs>
    _count?: boolean | ParagraphCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ParagraphIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    article?: boolean | ArticleDefaultArgs<ExtArgs>
  }
  export type ParagraphIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    article?: boolean | ArticleDefaultArgs<ExtArgs>
  }

  export type $ParagraphPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Paragraph"
    objects: {
      article: Prisma.$ArticlePayload<ExtArgs>
      items: Prisma.$ItemPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      articleId: string
      paragraphNumber: number
      content: string
    }, ExtArgs["result"]["paragraph"]>
    composites: {}
  }

  type ParagraphGetPayload<S extends boolean | null | undefined | ParagraphDefaultArgs> = $Result.GetResult<Prisma.$ParagraphPayload, S>

  type ParagraphCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ParagraphFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ParagraphCountAggregateInputType | true
    }

  export interface ParagraphDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Paragraph'], meta: { name: 'Paragraph' } }
    /**
     * Find zero or one Paragraph that matches the filter.
     * @param {ParagraphFindUniqueArgs} args - Arguments to find a Paragraph
     * @example
     * // Get one Paragraph
     * const paragraph = await prisma.paragraph.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ParagraphFindUniqueArgs>(args: SelectSubset<T, ParagraphFindUniqueArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Paragraph that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ParagraphFindUniqueOrThrowArgs} args - Arguments to find a Paragraph
     * @example
     * // Get one Paragraph
     * const paragraph = await prisma.paragraph.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ParagraphFindUniqueOrThrowArgs>(args: SelectSubset<T, ParagraphFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Paragraph that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphFindFirstArgs} args - Arguments to find a Paragraph
     * @example
     * // Get one Paragraph
     * const paragraph = await prisma.paragraph.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ParagraphFindFirstArgs>(args?: SelectSubset<T, ParagraphFindFirstArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Paragraph that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphFindFirstOrThrowArgs} args - Arguments to find a Paragraph
     * @example
     * // Get one Paragraph
     * const paragraph = await prisma.paragraph.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ParagraphFindFirstOrThrowArgs>(args?: SelectSubset<T, ParagraphFindFirstOrThrowArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Paragraphs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Paragraphs
     * const paragraphs = await prisma.paragraph.findMany()
     * 
     * // Get first 10 Paragraphs
     * const paragraphs = await prisma.paragraph.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const paragraphWithIdOnly = await prisma.paragraph.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ParagraphFindManyArgs>(args?: SelectSubset<T, ParagraphFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Paragraph.
     * @param {ParagraphCreateArgs} args - Arguments to create a Paragraph.
     * @example
     * // Create one Paragraph
     * const Paragraph = await prisma.paragraph.create({
     *   data: {
     *     // ... data to create a Paragraph
     *   }
     * })
     * 
     */
    create<T extends ParagraphCreateArgs>(args: SelectSubset<T, ParagraphCreateArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Paragraphs.
     * @param {ParagraphCreateManyArgs} args - Arguments to create many Paragraphs.
     * @example
     * // Create many Paragraphs
     * const paragraph = await prisma.paragraph.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ParagraphCreateManyArgs>(args?: SelectSubset<T, ParagraphCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Paragraphs and returns the data saved in the database.
     * @param {ParagraphCreateManyAndReturnArgs} args - Arguments to create many Paragraphs.
     * @example
     * // Create many Paragraphs
     * const paragraph = await prisma.paragraph.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Paragraphs and only return the `id`
     * const paragraphWithIdOnly = await prisma.paragraph.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ParagraphCreateManyAndReturnArgs>(args?: SelectSubset<T, ParagraphCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Paragraph.
     * @param {ParagraphDeleteArgs} args - Arguments to delete one Paragraph.
     * @example
     * // Delete one Paragraph
     * const Paragraph = await prisma.paragraph.delete({
     *   where: {
     *     // ... filter to delete one Paragraph
     *   }
     * })
     * 
     */
    delete<T extends ParagraphDeleteArgs>(args: SelectSubset<T, ParagraphDeleteArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Paragraph.
     * @param {ParagraphUpdateArgs} args - Arguments to update one Paragraph.
     * @example
     * // Update one Paragraph
     * const paragraph = await prisma.paragraph.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ParagraphUpdateArgs>(args: SelectSubset<T, ParagraphUpdateArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Paragraphs.
     * @param {ParagraphDeleteManyArgs} args - Arguments to filter Paragraphs to delete.
     * @example
     * // Delete a few Paragraphs
     * const { count } = await prisma.paragraph.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ParagraphDeleteManyArgs>(args?: SelectSubset<T, ParagraphDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Paragraphs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Paragraphs
     * const paragraph = await prisma.paragraph.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ParagraphUpdateManyArgs>(args: SelectSubset<T, ParagraphUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Paragraphs and returns the data updated in the database.
     * @param {ParagraphUpdateManyAndReturnArgs} args - Arguments to update many Paragraphs.
     * @example
     * // Update many Paragraphs
     * const paragraph = await prisma.paragraph.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Paragraphs and only return the `id`
     * const paragraphWithIdOnly = await prisma.paragraph.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ParagraphUpdateManyAndReturnArgs>(args: SelectSubset<T, ParagraphUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Paragraph.
     * @param {ParagraphUpsertArgs} args - Arguments to update or create a Paragraph.
     * @example
     * // Update or create a Paragraph
     * const paragraph = await prisma.paragraph.upsert({
     *   create: {
     *     // ... data to create a Paragraph
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Paragraph we want to update
     *   }
     * })
     */
    upsert<T extends ParagraphUpsertArgs>(args: SelectSubset<T, ParagraphUpsertArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Paragraphs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphCountArgs} args - Arguments to filter Paragraphs to count.
     * @example
     * // Count the number of Paragraphs
     * const count = await prisma.paragraph.count({
     *   where: {
     *     // ... the filter for the Paragraphs we want to count
     *   }
     * })
    **/
    count<T extends ParagraphCountArgs>(
      args?: Subset<T, ParagraphCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ParagraphCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Paragraph.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ParagraphAggregateArgs>(args: Subset<T, ParagraphAggregateArgs>): Prisma.PrismaPromise<GetParagraphAggregateType<T>>

    /**
     * Group by Paragraph.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ParagraphGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ParagraphGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ParagraphGroupByArgs['orderBy'] }
        : { orderBy?: ParagraphGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ParagraphGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetParagraphGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Paragraph model
   */
  readonly fields: ParagraphFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Paragraph.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ParagraphClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    article<T extends ArticleDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ArticleDefaultArgs<ExtArgs>>): Prisma__ArticleClient<$Result.GetResult<Prisma.$ArticlePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    items<T extends Paragraph$itemsArgs<ExtArgs> = {}>(args?: Subset<T, Paragraph$itemsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Paragraph model
   */
  interface ParagraphFieldRefs {
    readonly id: FieldRef<"Paragraph", 'String'>
    readonly articleId: FieldRef<"Paragraph", 'String'>
    readonly paragraphNumber: FieldRef<"Paragraph", 'Int'>
    readonly content: FieldRef<"Paragraph", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Paragraph findUnique
   */
  export type ParagraphFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter, which Paragraph to fetch.
     */
    where: ParagraphWhereUniqueInput
  }

  /**
   * Paragraph findUniqueOrThrow
   */
  export type ParagraphFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter, which Paragraph to fetch.
     */
    where: ParagraphWhereUniqueInput
  }

  /**
   * Paragraph findFirst
   */
  export type ParagraphFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter, which Paragraph to fetch.
     */
    where?: ParagraphWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Paragraphs to fetch.
     */
    orderBy?: ParagraphOrderByWithRelationInput | ParagraphOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Paragraphs.
     */
    cursor?: ParagraphWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Paragraphs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Paragraphs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Paragraphs.
     */
    distinct?: ParagraphScalarFieldEnum | ParagraphScalarFieldEnum[]
  }

  /**
   * Paragraph findFirstOrThrow
   */
  export type ParagraphFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter, which Paragraph to fetch.
     */
    where?: ParagraphWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Paragraphs to fetch.
     */
    orderBy?: ParagraphOrderByWithRelationInput | ParagraphOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Paragraphs.
     */
    cursor?: ParagraphWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Paragraphs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Paragraphs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Paragraphs.
     */
    distinct?: ParagraphScalarFieldEnum | ParagraphScalarFieldEnum[]
  }

  /**
   * Paragraph findMany
   */
  export type ParagraphFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter, which Paragraphs to fetch.
     */
    where?: ParagraphWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Paragraphs to fetch.
     */
    orderBy?: ParagraphOrderByWithRelationInput | ParagraphOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Paragraphs.
     */
    cursor?: ParagraphWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Paragraphs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Paragraphs.
     */
    skip?: number
    distinct?: ParagraphScalarFieldEnum | ParagraphScalarFieldEnum[]
  }

  /**
   * Paragraph create
   */
  export type ParagraphCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * The data needed to create a Paragraph.
     */
    data: XOR<ParagraphCreateInput, ParagraphUncheckedCreateInput>
  }

  /**
   * Paragraph createMany
   */
  export type ParagraphCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Paragraphs.
     */
    data: ParagraphCreateManyInput | ParagraphCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Paragraph createManyAndReturn
   */
  export type ParagraphCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * The data used to create many Paragraphs.
     */
    data: ParagraphCreateManyInput | ParagraphCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Paragraph update
   */
  export type ParagraphUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * The data needed to update a Paragraph.
     */
    data: XOR<ParagraphUpdateInput, ParagraphUncheckedUpdateInput>
    /**
     * Choose, which Paragraph to update.
     */
    where: ParagraphWhereUniqueInput
  }

  /**
   * Paragraph updateMany
   */
  export type ParagraphUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Paragraphs.
     */
    data: XOR<ParagraphUpdateManyMutationInput, ParagraphUncheckedUpdateManyInput>
    /**
     * Filter which Paragraphs to update
     */
    where?: ParagraphWhereInput
    /**
     * Limit how many Paragraphs to update.
     */
    limit?: number
  }

  /**
   * Paragraph updateManyAndReturn
   */
  export type ParagraphUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * The data used to update Paragraphs.
     */
    data: XOR<ParagraphUpdateManyMutationInput, ParagraphUncheckedUpdateManyInput>
    /**
     * Filter which Paragraphs to update
     */
    where?: ParagraphWhereInput
    /**
     * Limit how many Paragraphs to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Paragraph upsert
   */
  export type ParagraphUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * The filter to search for the Paragraph to update in case it exists.
     */
    where: ParagraphWhereUniqueInput
    /**
     * In case the Paragraph found by the `where` argument doesn't exist, create a new Paragraph with this data.
     */
    create: XOR<ParagraphCreateInput, ParagraphUncheckedCreateInput>
    /**
     * In case the Paragraph was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ParagraphUpdateInput, ParagraphUncheckedUpdateInput>
  }

  /**
   * Paragraph delete
   */
  export type ParagraphDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
    /**
     * Filter which Paragraph to delete.
     */
    where: ParagraphWhereUniqueInput
  }

  /**
   * Paragraph deleteMany
   */
  export type ParagraphDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Paragraphs to delete
     */
    where?: ParagraphWhereInput
    /**
     * Limit how many Paragraphs to delete.
     */
    limit?: number
  }

  /**
   * Paragraph.items
   */
  export type Paragraph$itemsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    where?: ItemWhereInput
    orderBy?: ItemOrderByWithRelationInput | ItemOrderByWithRelationInput[]
    cursor?: ItemWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ItemScalarFieldEnum | ItemScalarFieldEnum[]
  }

  /**
   * Paragraph without action
   */
  export type ParagraphDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Paragraph
     */
    select?: ParagraphSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Paragraph
     */
    omit?: ParagraphOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ParagraphInclude<ExtArgs> | null
  }


  /**
   * Model Item
   */

  export type AggregateItem = {
    _count: ItemCountAggregateOutputType | null
    _min: ItemMinAggregateOutputType | null
    _max: ItemMaxAggregateOutputType | null
  }

  export type ItemMinAggregateOutputType = {
    id: string | null
    paragraphId: string | null
    itemNumber: string | null
    content: string | null
  }

  export type ItemMaxAggregateOutputType = {
    id: string | null
    paragraphId: string | null
    itemNumber: string | null
    content: string | null
  }

  export type ItemCountAggregateOutputType = {
    id: number
    paragraphId: number
    itemNumber: number
    content: number
    _all: number
  }


  export type ItemMinAggregateInputType = {
    id?: true
    paragraphId?: true
    itemNumber?: true
    content?: true
  }

  export type ItemMaxAggregateInputType = {
    id?: true
    paragraphId?: true
    itemNumber?: true
    content?: true
  }

  export type ItemCountAggregateInputType = {
    id?: true
    paragraphId?: true
    itemNumber?: true
    content?: true
    _all?: true
  }

  export type ItemAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Item to aggregate.
     */
    where?: ItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Items to fetch.
     */
    orderBy?: ItemOrderByWithRelationInput | ItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Items from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Items.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Items
    **/
    _count?: true | ItemCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ItemMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ItemMaxAggregateInputType
  }

  export type GetItemAggregateType<T extends ItemAggregateArgs> = {
        [P in keyof T & keyof AggregateItem]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateItem[P]>
      : GetScalarType<T[P], AggregateItem[P]>
  }




  export type ItemGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ItemWhereInput
    orderBy?: ItemOrderByWithAggregationInput | ItemOrderByWithAggregationInput[]
    by: ItemScalarFieldEnum[] | ItemScalarFieldEnum
    having?: ItemScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ItemCountAggregateInputType | true
    _min?: ItemMinAggregateInputType
    _max?: ItemMaxAggregateInputType
  }

  export type ItemGroupByOutputType = {
    id: string
    paragraphId: string
    itemNumber: string
    content: string
    _count: ItemCountAggregateOutputType | null
    _min: ItemMinAggregateOutputType | null
    _max: ItemMaxAggregateOutputType | null
  }

  type GetItemGroupByPayload<T extends ItemGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ItemGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ItemGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ItemGroupByOutputType[P]>
            : GetScalarType<T[P], ItemGroupByOutputType[P]>
        }
      >
    >


  export type ItemSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    paragraphId?: boolean
    itemNumber?: boolean
    content?: boolean
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["item"]>

  export type ItemSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    paragraphId?: boolean
    itemNumber?: boolean
    content?: boolean
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["item"]>

  export type ItemSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    paragraphId?: boolean
    itemNumber?: boolean
    content?: boolean
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["item"]>

  export type ItemSelectScalar = {
    id?: boolean
    paragraphId?: boolean
    itemNumber?: boolean
    content?: boolean
  }

  export type ItemOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "paragraphId" | "itemNumber" | "content", ExtArgs["result"]["item"]>
  export type ItemInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }
  export type ItemIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }
  export type ItemIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    paragraph?: boolean | ParagraphDefaultArgs<ExtArgs>
  }

  export type $ItemPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Item"
    objects: {
      paragraph: Prisma.$ParagraphPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      paragraphId: string
      itemNumber: string
      content: string
    }, ExtArgs["result"]["item"]>
    composites: {}
  }

  type ItemGetPayload<S extends boolean | null | undefined | ItemDefaultArgs> = $Result.GetResult<Prisma.$ItemPayload, S>

  type ItemCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ItemFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ItemCountAggregateInputType | true
    }

  export interface ItemDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Item'], meta: { name: 'Item' } }
    /**
     * Find zero or one Item that matches the filter.
     * @param {ItemFindUniqueArgs} args - Arguments to find a Item
     * @example
     * // Get one Item
     * const item = await prisma.item.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ItemFindUniqueArgs>(args: SelectSubset<T, ItemFindUniqueArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Item that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ItemFindUniqueOrThrowArgs} args - Arguments to find a Item
     * @example
     * // Get one Item
     * const item = await prisma.item.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ItemFindUniqueOrThrowArgs>(args: SelectSubset<T, ItemFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Item that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemFindFirstArgs} args - Arguments to find a Item
     * @example
     * // Get one Item
     * const item = await prisma.item.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ItemFindFirstArgs>(args?: SelectSubset<T, ItemFindFirstArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Item that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemFindFirstOrThrowArgs} args - Arguments to find a Item
     * @example
     * // Get one Item
     * const item = await prisma.item.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ItemFindFirstOrThrowArgs>(args?: SelectSubset<T, ItemFindFirstOrThrowArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Items that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Items
     * const items = await prisma.item.findMany()
     * 
     * // Get first 10 Items
     * const items = await prisma.item.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const itemWithIdOnly = await prisma.item.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ItemFindManyArgs>(args?: SelectSubset<T, ItemFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Item.
     * @param {ItemCreateArgs} args - Arguments to create a Item.
     * @example
     * // Create one Item
     * const Item = await prisma.item.create({
     *   data: {
     *     // ... data to create a Item
     *   }
     * })
     * 
     */
    create<T extends ItemCreateArgs>(args: SelectSubset<T, ItemCreateArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Items.
     * @param {ItemCreateManyArgs} args - Arguments to create many Items.
     * @example
     * // Create many Items
     * const item = await prisma.item.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ItemCreateManyArgs>(args?: SelectSubset<T, ItemCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Items and returns the data saved in the database.
     * @param {ItemCreateManyAndReturnArgs} args - Arguments to create many Items.
     * @example
     * // Create many Items
     * const item = await prisma.item.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Items and only return the `id`
     * const itemWithIdOnly = await prisma.item.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ItemCreateManyAndReturnArgs>(args?: SelectSubset<T, ItemCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Item.
     * @param {ItemDeleteArgs} args - Arguments to delete one Item.
     * @example
     * // Delete one Item
     * const Item = await prisma.item.delete({
     *   where: {
     *     // ... filter to delete one Item
     *   }
     * })
     * 
     */
    delete<T extends ItemDeleteArgs>(args: SelectSubset<T, ItemDeleteArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Item.
     * @param {ItemUpdateArgs} args - Arguments to update one Item.
     * @example
     * // Update one Item
     * const item = await prisma.item.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ItemUpdateArgs>(args: SelectSubset<T, ItemUpdateArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Items.
     * @param {ItemDeleteManyArgs} args - Arguments to filter Items to delete.
     * @example
     * // Delete a few Items
     * const { count } = await prisma.item.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ItemDeleteManyArgs>(args?: SelectSubset<T, ItemDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Items.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Items
     * const item = await prisma.item.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ItemUpdateManyArgs>(args: SelectSubset<T, ItemUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Items and returns the data updated in the database.
     * @param {ItemUpdateManyAndReturnArgs} args - Arguments to update many Items.
     * @example
     * // Update many Items
     * const item = await prisma.item.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Items and only return the `id`
     * const itemWithIdOnly = await prisma.item.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ItemUpdateManyAndReturnArgs>(args: SelectSubset<T, ItemUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Item.
     * @param {ItemUpsertArgs} args - Arguments to update or create a Item.
     * @example
     * // Update or create a Item
     * const item = await prisma.item.upsert({
     *   create: {
     *     // ... data to create a Item
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Item we want to update
     *   }
     * })
     */
    upsert<T extends ItemUpsertArgs>(args: SelectSubset<T, ItemUpsertArgs<ExtArgs>>): Prisma__ItemClient<$Result.GetResult<Prisma.$ItemPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Items.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemCountArgs} args - Arguments to filter Items to count.
     * @example
     * // Count the number of Items
     * const count = await prisma.item.count({
     *   where: {
     *     // ... the filter for the Items we want to count
     *   }
     * })
    **/
    count<T extends ItemCountArgs>(
      args?: Subset<T, ItemCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ItemCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Item.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ItemAggregateArgs>(args: Subset<T, ItemAggregateArgs>): Prisma.PrismaPromise<GetItemAggregateType<T>>

    /**
     * Group by Item.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ItemGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ItemGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ItemGroupByArgs['orderBy'] }
        : { orderBy?: ItemGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ItemGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetItemGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Item model
   */
  readonly fields: ItemFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Item.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ItemClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    paragraph<T extends ParagraphDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ParagraphDefaultArgs<ExtArgs>>): Prisma__ParagraphClient<$Result.GetResult<Prisma.$ParagraphPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Item model
   */
  interface ItemFieldRefs {
    readonly id: FieldRef<"Item", 'String'>
    readonly paragraphId: FieldRef<"Item", 'String'>
    readonly itemNumber: FieldRef<"Item", 'String'>
    readonly content: FieldRef<"Item", 'String'>
  }
    

  // Custom InputTypes
  /**
   * Item findUnique
   */
  export type ItemFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter, which Item to fetch.
     */
    where: ItemWhereUniqueInput
  }

  /**
   * Item findUniqueOrThrow
   */
  export type ItemFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter, which Item to fetch.
     */
    where: ItemWhereUniqueInput
  }

  /**
   * Item findFirst
   */
  export type ItemFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter, which Item to fetch.
     */
    where?: ItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Items to fetch.
     */
    orderBy?: ItemOrderByWithRelationInput | ItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Items.
     */
    cursor?: ItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Items from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Items.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Items.
     */
    distinct?: ItemScalarFieldEnum | ItemScalarFieldEnum[]
  }

  /**
   * Item findFirstOrThrow
   */
  export type ItemFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter, which Item to fetch.
     */
    where?: ItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Items to fetch.
     */
    orderBy?: ItemOrderByWithRelationInput | ItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Items.
     */
    cursor?: ItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Items from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Items.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Items.
     */
    distinct?: ItemScalarFieldEnum | ItemScalarFieldEnum[]
  }

  /**
   * Item findMany
   */
  export type ItemFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter, which Items to fetch.
     */
    where?: ItemWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Items to fetch.
     */
    orderBy?: ItemOrderByWithRelationInput | ItemOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Items.
     */
    cursor?: ItemWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Items from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Items.
     */
    skip?: number
    distinct?: ItemScalarFieldEnum | ItemScalarFieldEnum[]
  }

  /**
   * Item create
   */
  export type ItemCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * The data needed to create a Item.
     */
    data: XOR<ItemCreateInput, ItemUncheckedCreateInput>
  }

  /**
   * Item createMany
   */
  export type ItemCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Items.
     */
    data: ItemCreateManyInput | ItemCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Item createManyAndReturn
   */
  export type ItemCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * The data used to create many Items.
     */
    data: ItemCreateManyInput | ItemCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Item update
   */
  export type ItemUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * The data needed to update a Item.
     */
    data: XOR<ItemUpdateInput, ItemUncheckedUpdateInput>
    /**
     * Choose, which Item to update.
     */
    where: ItemWhereUniqueInput
  }

  /**
   * Item updateMany
   */
  export type ItemUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Items.
     */
    data: XOR<ItemUpdateManyMutationInput, ItemUncheckedUpdateManyInput>
    /**
     * Filter which Items to update
     */
    where?: ItemWhereInput
    /**
     * Limit how many Items to update.
     */
    limit?: number
  }

  /**
   * Item updateManyAndReturn
   */
  export type ItemUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * The data used to update Items.
     */
    data: XOR<ItemUpdateManyMutationInput, ItemUncheckedUpdateManyInput>
    /**
     * Filter which Items to update
     */
    where?: ItemWhereInput
    /**
     * Limit how many Items to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Item upsert
   */
  export type ItemUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * The filter to search for the Item to update in case it exists.
     */
    where: ItemWhereUniqueInput
    /**
     * In case the Item found by the `where` argument doesn't exist, create a new Item with this data.
     */
    create: XOR<ItemCreateInput, ItemUncheckedCreateInput>
    /**
     * In case the Item was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ItemUpdateInput, ItemUncheckedUpdateInput>
  }

  /**
   * Item delete
   */
  export type ItemDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
    /**
     * Filter which Item to delete.
     */
    where: ItemWhereUniqueInput
  }

  /**
   * Item deleteMany
   */
  export type ItemDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Items to delete
     */
    where?: ItemWhereInput
    /**
     * Limit how many Items to delete.
     */
    limit?: number
  }

  /**
   * Item without action
   */
  export type ItemDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Item
     */
    select?: ItemSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Item
     */
    omit?: ItemOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ItemInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const LawScalarFieldEnum: {
    id: 'id',
    title: 'title',
    lawType: 'lawType',
    lawNumber: 'lawNumber',
    promulgationDate: 'promulgationDate',
    effectiveDate: 'effectiveDate',
    xmlContent: 'xmlContent',
    status: 'status',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type LawScalarFieldEnum = (typeof LawScalarFieldEnum)[keyof typeof LawScalarFieldEnum]


  export const ArticleScalarFieldEnum: {
    id: 'id',
    lawId: 'lawId',
    articleNumber: 'articleNumber',
    articleTitle: 'articleTitle',
    content: 'content',
    chapter: 'chapter',
    section: 'section',
    sortOrder: 'sortOrder',
    isDeleted: 'isDeleted'
  };

  export type ArticleScalarFieldEnum = (typeof ArticleScalarFieldEnum)[keyof typeof ArticleScalarFieldEnum]


  export const ParagraphScalarFieldEnum: {
    id: 'id',
    articleId: 'articleId',
    paragraphNumber: 'paragraphNumber',
    content: 'content'
  };

  export type ParagraphScalarFieldEnum = (typeof ParagraphScalarFieldEnum)[keyof typeof ParagraphScalarFieldEnum]


  export const ItemScalarFieldEnum: {
    id: 'id',
    paragraphId: 'paragraphId',
    itemNumber: 'itemNumber',
    content: 'content'
  };

  export type ItemScalarFieldEnum = (typeof ItemScalarFieldEnum)[keyof typeof ItemScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type LawWhereInput = {
    AND?: LawWhereInput | LawWhereInput[]
    OR?: LawWhereInput[]
    NOT?: LawWhereInput | LawWhereInput[]
    id?: StringFilter<"Law"> | string
    title?: StringFilter<"Law"> | string
    lawType?: StringNullableFilter<"Law"> | string | null
    lawNumber?: StringNullableFilter<"Law"> | string | null
    promulgationDate?: DateTimeNullableFilter<"Law"> | Date | string | null
    effectiveDate?: DateTimeNullableFilter<"Law"> | Date | string | null
    xmlContent?: StringFilter<"Law"> | string
    status?: StringFilter<"Law"> | string
    createdAt?: DateTimeFilter<"Law"> | Date | string
    updatedAt?: DateTimeFilter<"Law"> | Date | string
    articles?: ArticleListRelationFilter
  }

  export type LawOrderByWithRelationInput = {
    id?: SortOrder
    title?: SortOrder
    lawType?: SortOrderInput | SortOrder
    lawNumber?: SortOrderInput | SortOrder
    promulgationDate?: SortOrderInput | SortOrder
    effectiveDate?: SortOrderInput | SortOrder
    xmlContent?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    articles?: ArticleOrderByRelationAggregateInput
  }

  export type LawWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: LawWhereInput | LawWhereInput[]
    OR?: LawWhereInput[]
    NOT?: LawWhereInput | LawWhereInput[]
    title?: StringFilter<"Law"> | string
    lawType?: StringNullableFilter<"Law"> | string | null
    lawNumber?: StringNullableFilter<"Law"> | string | null
    promulgationDate?: DateTimeNullableFilter<"Law"> | Date | string | null
    effectiveDate?: DateTimeNullableFilter<"Law"> | Date | string | null
    xmlContent?: StringFilter<"Law"> | string
    status?: StringFilter<"Law"> | string
    createdAt?: DateTimeFilter<"Law"> | Date | string
    updatedAt?: DateTimeFilter<"Law"> | Date | string
    articles?: ArticleListRelationFilter
  }, "id">

  export type LawOrderByWithAggregationInput = {
    id?: SortOrder
    title?: SortOrder
    lawType?: SortOrderInput | SortOrder
    lawNumber?: SortOrderInput | SortOrder
    promulgationDate?: SortOrderInput | SortOrder
    effectiveDate?: SortOrderInput | SortOrder
    xmlContent?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: LawCountOrderByAggregateInput
    _max?: LawMaxOrderByAggregateInput
    _min?: LawMinOrderByAggregateInput
  }

  export type LawScalarWhereWithAggregatesInput = {
    AND?: LawScalarWhereWithAggregatesInput | LawScalarWhereWithAggregatesInput[]
    OR?: LawScalarWhereWithAggregatesInput[]
    NOT?: LawScalarWhereWithAggregatesInput | LawScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Law"> | string
    title?: StringWithAggregatesFilter<"Law"> | string
    lawType?: StringNullableWithAggregatesFilter<"Law"> | string | null
    lawNumber?: StringNullableWithAggregatesFilter<"Law"> | string | null
    promulgationDate?: DateTimeNullableWithAggregatesFilter<"Law"> | Date | string | null
    effectiveDate?: DateTimeNullableWithAggregatesFilter<"Law"> | Date | string | null
    xmlContent?: StringWithAggregatesFilter<"Law"> | string
    status?: StringWithAggregatesFilter<"Law"> | string
    createdAt?: DateTimeWithAggregatesFilter<"Law"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Law"> | Date | string
  }

  export type ArticleWhereInput = {
    AND?: ArticleWhereInput | ArticleWhereInput[]
    OR?: ArticleWhereInput[]
    NOT?: ArticleWhereInput | ArticleWhereInput[]
    id?: StringFilter<"Article"> | string
    lawId?: StringFilter<"Article"> | string
    articleNumber?: StringFilter<"Article"> | string
    articleTitle?: StringNullableFilter<"Article"> | string | null
    content?: StringFilter<"Article"> | string
    chapter?: StringNullableFilter<"Article"> | string | null
    section?: StringNullableFilter<"Article"> | string | null
    sortOrder?: IntFilter<"Article"> | number
    isDeleted?: BoolFilter<"Article"> | boolean
    law?: XOR<LawScalarRelationFilter, LawWhereInput>
    paragraphs?: ParagraphListRelationFilter
  }

  export type ArticleOrderByWithRelationInput = {
    id?: SortOrder
    lawId?: SortOrder
    articleNumber?: SortOrder
    articleTitle?: SortOrderInput | SortOrder
    content?: SortOrder
    chapter?: SortOrderInput | SortOrder
    section?: SortOrderInput | SortOrder
    sortOrder?: SortOrder
    isDeleted?: SortOrder
    law?: LawOrderByWithRelationInput
    paragraphs?: ParagraphOrderByRelationAggregateInput
  }

  export type ArticleWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    lawId_articleNumber?: ArticleLawIdArticleNumberCompoundUniqueInput
    AND?: ArticleWhereInput | ArticleWhereInput[]
    OR?: ArticleWhereInput[]
    NOT?: ArticleWhereInput | ArticleWhereInput[]
    lawId?: StringFilter<"Article"> | string
    articleNumber?: StringFilter<"Article"> | string
    articleTitle?: StringNullableFilter<"Article"> | string | null
    content?: StringFilter<"Article"> | string
    chapter?: StringNullableFilter<"Article"> | string | null
    section?: StringNullableFilter<"Article"> | string | null
    sortOrder?: IntFilter<"Article"> | number
    isDeleted?: BoolFilter<"Article"> | boolean
    law?: XOR<LawScalarRelationFilter, LawWhereInput>
    paragraphs?: ParagraphListRelationFilter
  }, "id" | "lawId_articleNumber">

  export type ArticleOrderByWithAggregationInput = {
    id?: SortOrder
    lawId?: SortOrder
    articleNumber?: SortOrder
    articleTitle?: SortOrderInput | SortOrder
    content?: SortOrder
    chapter?: SortOrderInput | SortOrder
    section?: SortOrderInput | SortOrder
    sortOrder?: SortOrder
    isDeleted?: SortOrder
    _count?: ArticleCountOrderByAggregateInput
    _avg?: ArticleAvgOrderByAggregateInput
    _max?: ArticleMaxOrderByAggregateInput
    _min?: ArticleMinOrderByAggregateInput
    _sum?: ArticleSumOrderByAggregateInput
  }

  export type ArticleScalarWhereWithAggregatesInput = {
    AND?: ArticleScalarWhereWithAggregatesInput | ArticleScalarWhereWithAggregatesInput[]
    OR?: ArticleScalarWhereWithAggregatesInput[]
    NOT?: ArticleScalarWhereWithAggregatesInput | ArticleScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Article"> | string
    lawId?: StringWithAggregatesFilter<"Article"> | string
    articleNumber?: StringWithAggregatesFilter<"Article"> | string
    articleTitle?: StringNullableWithAggregatesFilter<"Article"> | string | null
    content?: StringWithAggregatesFilter<"Article"> | string
    chapter?: StringNullableWithAggregatesFilter<"Article"> | string | null
    section?: StringNullableWithAggregatesFilter<"Article"> | string | null
    sortOrder?: IntWithAggregatesFilter<"Article"> | number
    isDeleted?: BoolWithAggregatesFilter<"Article"> | boolean
  }

  export type ParagraphWhereInput = {
    AND?: ParagraphWhereInput | ParagraphWhereInput[]
    OR?: ParagraphWhereInput[]
    NOT?: ParagraphWhereInput | ParagraphWhereInput[]
    id?: StringFilter<"Paragraph"> | string
    articleId?: StringFilter<"Paragraph"> | string
    paragraphNumber?: IntFilter<"Paragraph"> | number
    content?: StringFilter<"Paragraph"> | string
    article?: XOR<ArticleScalarRelationFilter, ArticleWhereInput>
    items?: ItemListRelationFilter
  }

  export type ParagraphOrderByWithRelationInput = {
    id?: SortOrder
    articleId?: SortOrder
    paragraphNumber?: SortOrder
    content?: SortOrder
    article?: ArticleOrderByWithRelationInput
    items?: ItemOrderByRelationAggregateInput
  }

  export type ParagraphWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    articleId_paragraphNumber?: ParagraphArticleIdParagraphNumberCompoundUniqueInput
    AND?: ParagraphWhereInput | ParagraphWhereInput[]
    OR?: ParagraphWhereInput[]
    NOT?: ParagraphWhereInput | ParagraphWhereInput[]
    articleId?: StringFilter<"Paragraph"> | string
    paragraphNumber?: IntFilter<"Paragraph"> | number
    content?: StringFilter<"Paragraph"> | string
    article?: XOR<ArticleScalarRelationFilter, ArticleWhereInput>
    items?: ItemListRelationFilter
  }, "id" | "articleId_paragraphNumber">

  export type ParagraphOrderByWithAggregationInput = {
    id?: SortOrder
    articleId?: SortOrder
    paragraphNumber?: SortOrder
    content?: SortOrder
    _count?: ParagraphCountOrderByAggregateInput
    _avg?: ParagraphAvgOrderByAggregateInput
    _max?: ParagraphMaxOrderByAggregateInput
    _min?: ParagraphMinOrderByAggregateInput
    _sum?: ParagraphSumOrderByAggregateInput
  }

  export type ParagraphScalarWhereWithAggregatesInput = {
    AND?: ParagraphScalarWhereWithAggregatesInput | ParagraphScalarWhereWithAggregatesInput[]
    OR?: ParagraphScalarWhereWithAggregatesInput[]
    NOT?: ParagraphScalarWhereWithAggregatesInput | ParagraphScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Paragraph"> | string
    articleId?: StringWithAggregatesFilter<"Paragraph"> | string
    paragraphNumber?: IntWithAggregatesFilter<"Paragraph"> | number
    content?: StringWithAggregatesFilter<"Paragraph"> | string
  }

  export type ItemWhereInput = {
    AND?: ItemWhereInput | ItemWhereInput[]
    OR?: ItemWhereInput[]
    NOT?: ItemWhereInput | ItemWhereInput[]
    id?: StringFilter<"Item"> | string
    paragraphId?: StringFilter<"Item"> | string
    itemNumber?: StringFilter<"Item"> | string
    content?: StringFilter<"Item"> | string
    paragraph?: XOR<ParagraphScalarRelationFilter, ParagraphWhereInput>
  }

  export type ItemOrderByWithRelationInput = {
    id?: SortOrder
    paragraphId?: SortOrder
    itemNumber?: SortOrder
    content?: SortOrder
    paragraph?: ParagraphOrderByWithRelationInput
  }

  export type ItemWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    paragraphId_itemNumber?: ItemParagraphIdItemNumberCompoundUniqueInput
    AND?: ItemWhereInput | ItemWhereInput[]
    OR?: ItemWhereInput[]
    NOT?: ItemWhereInput | ItemWhereInput[]
    paragraphId?: StringFilter<"Item"> | string
    itemNumber?: StringFilter<"Item"> | string
    content?: StringFilter<"Item"> | string
    paragraph?: XOR<ParagraphScalarRelationFilter, ParagraphWhereInput>
  }, "id" | "paragraphId_itemNumber">

  export type ItemOrderByWithAggregationInput = {
    id?: SortOrder
    paragraphId?: SortOrder
    itemNumber?: SortOrder
    content?: SortOrder
    _count?: ItemCountOrderByAggregateInput
    _max?: ItemMaxOrderByAggregateInput
    _min?: ItemMinOrderByAggregateInput
  }

  export type ItemScalarWhereWithAggregatesInput = {
    AND?: ItemScalarWhereWithAggregatesInput | ItemScalarWhereWithAggregatesInput[]
    OR?: ItemScalarWhereWithAggregatesInput[]
    NOT?: ItemScalarWhereWithAggregatesInput | ItemScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Item"> | string
    paragraphId?: StringWithAggregatesFilter<"Item"> | string
    itemNumber?: StringWithAggregatesFilter<"Item"> | string
    content?: StringWithAggregatesFilter<"Item"> | string
  }

  export type LawCreateInput = {
    id: string
    title: string
    lawType?: string | null
    lawNumber?: string | null
    promulgationDate?: Date | string | null
    effectiveDate?: Date | string | null
    xmlContent: string
    status?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    articles?: ArticleCreateNestedManyWithoutLawInput
  }

  export type LawUncheckedCreateInput = {
    id: string
    title: string
    lawType?: string | null
    lawNumber?: string | null
    promulgationDate?: Date | string | null
    effectiveDate?: Date | string | null
    xmlContent: string
    status?: string
    createdAt?: Date | string
    updatedAt?: Date | string
    articles?: ArticleUncheckedCreateNestedManyWithoutLawInput
  }

  export type LawUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    articles?: ArticleUpdateManyWithoutLawNestedInput
  }

  export type LawUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    articles?: ArticleUncheckedUpdateManyWithoutLawNestedInput
  }

  export type LawCreateManyInput = {
    id: string
    title: string
    lawType?: string | null
    lawNumber?: string | null
    promulgationDate?: Date | string | null
    effectiveDate?: Date | string | null
    xmlContent: string
    status?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LawUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LawUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ArticleCreateInput = {
    id?: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
    law: LawCreateNestedOneWithoutArticlesInput
    paragraphs?: ParagraphCreateNestedManyWithoutArticleInput
  }

  export type ArticleUncheckedCreateInput = {
    id?: string
    lawId: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
    paragraphs?: ParagraphUncheckedCreateNestedManyWithoutArticleInput
  }

  export type ArticleUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
    law?: LawUpdateOneRequiredWithoutArticlesNestedInput
    paragraphs?: ParagraphUpdateManyWithoutArticleNestedInput
  }

  export type ArticleUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    lawId?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
    paragraphs?: ParagraphUncheckedUpdateManyWithoutArticleNestedInput
  }

  export type ArticleCreateManyInput = {
    id?: string
    lawId: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
  }

  export type ArticleUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
  }

  export type ArticleUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    lawId?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
  }

  export type ParagraphCreateInput = {
    id?: string
    paragraphNumber: number
    content: string
    article: ArticleCreateNestedOneWithoutParagraphsInput
    items?: ItemCreateNestedManyWithoutParagraphInput
  }

  export type ParagraphUncheckedCreateInput = {
    id?: string
    articleId: string
    paragraphNumber: number
    content: string
    items?: ItemUncheckedCreateNestedManyWithoutParagraphInput
  }

  export type ParagraphUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
    article?: ArticleUpdateOneRequiredWithoutParagraphsNestedInput
    items?: ItemUpdateManyWithoutParagraphNestedInput
  }

  export type ParagraphUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleId?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
    items?: ItemUncheckedUpdateManyWithoutParagraphNestedInput
  }

  export type ParagraphCreateManyInput = {
    id?: string
    articleId: string
    paragraphNumber: number
    content: string
  }

  export type ParagraphUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ParagraphUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleId?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemCreateInput = {
    id?: string
    itemNumber: string
    content: string
    paragraph: ParagraphCreateNestedOneWithoutItemsInput
  }

  export type ItemUncheckedCreateInput = {
    id?: string
    paragraphId: string
    itemNumber: string
    content: string
  }

  export type ItemUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
    paragraph?: ParagraphUpdateOneRequiredWithoutItemsNestedInput
  }

  export type ItemUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphId?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemCreateManyInput = {
    id?: string
    paragraphId: string
    itemNumber: string
    content: string
  }

  export type ItemUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphId?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type ArticleListRelationFilter = {
    every?: ArticleWhereInput
    some?: ArticleWhereInput
    none?: ArticleWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type ArticleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type LawCountOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    lawType?: SortOrder
    lawNumber?: SortOrder
    promulgationDate?: SortOrder
    effectiveDate?: SortOrder
    xmlContent?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LawMaxOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    lawType?: SortOrder
    lawNumber?: SortOrder
    promulgationDate?: SortOrder
    effectiveDate?: SortOrder
    xmlContent?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type LawMinOrderByAggregateInput = {
    id?: SortOrder
    title?: SortOrder
    lawType?: SortOrder
    lawNumber?: SortOrder
    promulgationDate?: SortOrder
    effectiveDate?: SortOrder
    xmlContent?: SortOrder
    status?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type LawScalarRelationFilter = {
    is?: LawWhereInput
    isNot?: LawWhereInput
  }

  export type ParagraphListRelationFilter = {
    every?: ParagraphWhereInput
    some?: ParagraphWhereInput
    none?: ParagraphWhereInput
  }

  export type ParagraphOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ArticleLawIdArticleNumberCompoundUniqueInput = {
    lawId: string
    articleNumber: string
  }

  export type ArticleCountOrderByAggregateInput = {
    id?: SortOrder
    lawId?: SortOrder
    articleNumber?: SortOrder
    articleTitle?: SortOrder
    content?: SortOrder
    chapter?: SortOrder
    section?: SortOrder
    sortOrder?: SortOrder
    isDeleted?: SortOrder
  }

  export type ArticleAvgOrderByAggregateInput = {
    sortOrder?: SortOrder
  }

  export type ArticleMaxOrderByAggregateInput = {
    id?: SortOrder
    lawId?: SortOrder
    articleNumber?: SortOrder
    articleTitle?: SortOrder
    content?: SortOrder
    chapter?: SortOrder
    section?: SortOrder
    sortOrder?: SortOrder
    isDeleted?: SortOrder
  }

  export type ArticleMinOrderByAggregateInput = {
    id?: SortOrder
    lawId?: SortOrder
    articleNumber?: SortOrder
    articleTitle?: SortOrder
    content?: SortOrder
    chapter?: SortOrder
    section?: SortOrder
    sortOrder?: SortOrder
    isDeleted?: SortOrder
  }

  export type ArticleSumOrderByAggregateInput = {
    sortOrder?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type ArticleScalarRelationFilter = {
    is?: ArticleWhereInput
    isNot?: ArticleWhereInput
  }

  export type ItemListRelationFilter = {
    every?: ItemWhereInput
    some?: ItemWhereInput
    none?: ItemWhereInput
  }

  export type ItemOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ParagraphArticleIdParagraphNumberCompoundUniqueInput = {
    articleId: string
    paragraphNumber: number
  }

  export type ParagraphCountOrderByAggregateInput = {
    id?: SortOrder
    articleId?: SortOrder
    paragraphNumber?: SortOrder
    content?: SortOrder
  }

  export type ParagraphAvgOrderByAggregateInput = {
    paragraphNumber?: SortOrder
  }

  export type ParagraphMaxOrderByAggregateInput = {
    id?: SortOrder
    articleId?: SortOrder
    paragraphNumber?: SortOrder
    content?: SortOrder
  }

  export type ParagraphMinOrderByAggregateInput = {
    id?: SortOrder
    articleId?: SortOrder
    paragraphNumber?: SortOrder
    content?: SortOrder
  }

  export type ParagraphSumOrderByAggregateInput = {
    paragraphNumber?: SortOrder
  }

  export type ParagraphScalarRelationFilter = {
    is?: ParagraphWhereInput
    isNot?: ParagraphWhereInput
  }

  export type ItemParagraphIdItemNumberCompoundUniqueInput = {
    paragraphId: string
    itemNumber: string
  }

  export type ItemCountOrderByAggregateInput = {
    id?: SortOrder
    paragraphId?: SortOrder
    itemNumber?: SortOrder
    content?: SortOrder
  }

  export type ItemMaxOrderByAggregateInput = {
    id?: SortOrder
    paragraphId?: SortOrder
    itemNumber?: SortOrder
    content?: SortOrder
  }

  export type ItemMinOrderByAggregateInput = {
    id?: SortOrder
    paragraphId?: SortOrder
    itemNumber?: SortOrder
    content?: SortOrder
  }

  export type ArticleCreateNestedManyWithoutLawInput = {
    create?: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput> | ArticleCreateWithoutLawInput[] | ArticleUncheckedCreateWithoutLawInput[]
    connectOrCreate?: ArticleCreateOrConnectWithoutLawInput | ArticleCreateOrConnectWithoutLawInput[]
    createMany?: ArticleCreateManyLawInputEnvelope
    connect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
  }

  export type ArticleUncheckedCreateNestedManyWithoutLawInput = {
    create?: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput> | ArticleCreateWithoutLawInput[] | ArticleUncheckedCreateWithoutLawInput[]
    connectOrCreate?: ArticleCreateOrConnectWithoutLawInput | ArticleCreateOrConnectWithoutLawInput[]
    createMany?: ArticleCreateManyLawInputEnvelope
    connect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type ArticleUpdateManyWithoutLawNestedInput = {
    create?: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput> | ArticleCreateWithoutLawInput[] | ArticleUncheckedCreateWithoutLawInput[]
    connectOrCreate?: ArticleCreateOrConnectWithoutLawInput | ArticleCreateOrConnectWithoutLawInput[]
    upsert?: ArticleUpsertWithWhereUniqueWithoutLawInput | ArticleUpsertWithWhereUniqueWithoutLawInput[]
    createMany?: ArticleCreateManyLawInputEnvelope
    set?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    disconnect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    delete?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    connect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    update?: ArticleUpdateWithWhereUniqueWithoutLawInput | ArticleUpdateWithWhereUniqueWithoutLawInput[]
    updateMany?: ArticleUpdateManyWithWhereWithoutLawInput | ArticleUpdateManyWithWhereWithoutLawInput[]
    deleteMany?: ArticleScalarWhereInput | ArticleScalarWhereInput[]
  }

  export type ArticleUncheckedUpdateManyWithoutLawNestedInput = {
    create?: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput> | ArticleCreateWithoutLawInput[] | ArticleUncheckedCreateWithoutLawInput[]
    connectOrCreate?: ArticleCreateOrConnectWithoutLawInput | ArticleCreateOrConnectWithoutLawInput[]
    upsert?: ArticleUpsertWithWhereUniqueWithoutLawInput | ArticleUpsertWithWhereUniqueWithoutLawInput[]
    createMany?: ArticleCreateManyLawInputEnvelope
    set?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    disconnect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    delete?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    connect?: ArticleWhereUniqueInput | ArticleWhereUniqueInput[]
    update?: ArticleUpdateWithWhereUniqueWithoutLawInput | ArticleUpdateWithWhereUniqueWithoutLawInput[]
    updateMany?: ArticleUpdateManyWithWhereWithoutLawInput | ArticleUpdateManyWithWhereWithoutLawInput[]
    deleteMany?: ArticleScalarWhereInput | ArticleScalarWhereInput[]
  }

  export type LawCreateNestedOneWithoutArticlesInput = {
    create?: XOR<LawCreateWithoutArticlesInput, LawUncheckedCreateWithoutArticlesInput>
    connectOrCreate?: LawCreateOrConnectWithoutArticlesInput
    connect?: LawWhereUniqueInput
  }

  export type ParagraphCreateNestedManyWithoutArticleInput = {
    create?: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput> | ParagraphCreateWithoutArticleInput[] | ParagraphUncheckedCreateWithoutArticleInput[]
    connectOrCreate?: ParagraphCreateOrConnectWithoutArticleInput | ParagraphCreateOrConnectWithoutArticleInput[]
    createMany?: ParagraphCreateManyArticleInputEnvelope
    connect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
  }

  export type ParagraphUncheckedCreateNestedManyWithoutArticleInput = {
    create?: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput> | ParagraphCreateWithoutArticleInput[] | ParagraphUncheckedCreateWithoutArticleInput[]
    connectOrCreate?: ParagraphCreateOrConnectWithoutArticleInput | ParagraphCreateOrConnectWithoutArticleInput[]
    createMany?: ParagraphCreateManyArticleInputEnvelope
    connect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type LawUpdateOneRequiredWithoutArticlesNestedInput = {
    create?: XOR<LawCreateWithoutArticlesInput, LawUncheckedCreateWithoutArticlesInput>
    connectOrCreate?: LawCreateOrConnectWithoutArticlesInput
    upsert?: LawUpsertWithoutArticlesInput
    connect?: LawWhereUniqueInput
    update?: XOR<XOR<LawUpdateToOneWithWhereWithoutArticlesInput, LawUpdateWithoutArticlesInput>, LawUncheckedUpdateWithoutArticlesInput>
  }

  export type ParagraphUpdateManyWithoutArticleNestedInput = {
    create?: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput> | ParagraphCreateWithoutArticleInput[] | ParagraphUncheckedCreateWithoutArticleInput[]
    connectOrCreate?: ParagraphCreateOrConnectWithoutArticleInput | ParagraphCreateOrConnectWithoutArticleInput[]
    upsert?: ParagraphUpsertWithWhereUniqueWithoutArticleInput | ParagraphUpsertWithWhereUniqueWithoutArticleInput[]
    createMany?: ParagraphCreateManyArticleInputEnvelope
    set?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    disconnect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    delete?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    connect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    update?: ParagraphUpdateWithWhereUniqueWithoutArticleInput | ParagraphUpdateWithWhereUniqueWithoutArticleInput[]
    updateMany?: ParagraphUpdateManyWithWhereWithoutArticleInput | ParagraphUpdateManyWithWhereWithoutArticleInput[]
    deleteMany?: ParagraphScalarWhereInput | ParagraphScalarWhereInput[]
  }

  export type ParagraphUncheckedUpdateManyWithoutArticleNestedInput = {
    create?: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput> | ParagraphCreateWithoutArticleInput[] | ParagraphUncheckedCreateWithoutArticleInput[]
    connectOrCreate?: ParagraphCreateOrConnectWithoutArticleInput | ParagraphCreateOrConnectWithoutArticleInput[]
    upsert?: ParagraphUpsertWithWhereUniqueWithoutArticleInput | ParagraphUpsertWithWhereUniqueWithoutArticleInput[]
    createMany?: ParagraphCreateManyArticleInputEnvelope
    set?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    disconnect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    delete?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    connect?: ParagraphWhereUniqueInput | ParagraphWhereUniqueInput[]
    update?: ParagraphUpdateWithWhereUniqueWithoutArticleInput | ParagraphUpdateWithWhereUniqueWithoutArticleInput[]
    updateMany?: ParagraphUpdateManyWithWhereWithoutArticleInput | ParagraphUpdateManyWithWhereWithoutArticleInput[]
    deleteMany?: ParagraphScalarWhereInput | ParagraphScalarWhereInput[]
  }

  export type ArticleCreateNestedOneWithoutParagraphsInput = {
    create?: XOR<ArticleCreateWithoutParagraphsInput, ArticleUncheckedCreateWithoutParagraphsInput>
    connectOrCreate?: ArticleCreateOrConnectWithoutParagraphsInput
    connect?: ArticleWhereUniqueInput
  }

  export type ItemCreateNestedManyWithoutParagraphInput = {
    create?: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput> | ItemCreateWithoutParagraphInput[] | ItemUncheckedCreateWithoutParagraphInput[]
    connectOrCreate?: ItemCreateOrConnectWithoutParagraphInput | ItemCreateOrConnectWithoutParagraphInput[]
    createMany?: ItemCreateManyParagraphInputEnvelope
    connect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
  }

  export type ItemUncheckedCreateNestedManyWithoutParagraphInput = {
    create?: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput> | ItemCreateWithoutParagraphInput[] | ItemUncheckedCreateWithoutParagraphInput[]
    connectOrCreate?: ItemCreateOrConnectWithoutParagraphInput | ItemCreateOrConnectWithoutParagraphInput[]
    createMany?: ItemCreateManyParagraphInputEnvelope
    connect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
  }

  export type ArticleUpdateOneRequiredWithoutParagraphsNestedInput = {
    create?: XOR<ArticleCreateWithoutParagraphsInput, ArticleUncheckedCreateWithoutParagraphsInput>
    connectOrCreate?: ArticleCreateOrConnectWithoutParagraphsInput
    upsert?: ArticleUpsertWithoutParagraphsInput
    connect?: ArticleWhereUniqueInput
    update?: XOR<XOR<ArticleUpdateToOneWithWhereWithoutParagraphsInput, ArticleUpdateWithoutParagraphsInput>, ArticleUncheckedUpdateWithoutParagraphsInput>
  }

  export type ItemUpdateManyWithoutParagraphNestedInput = {
    create?: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput> | ItemCreateWithoutParagraphInput[] | ItemUncheckedCreateWithoutParagraphInput[]
    connectOrCreate?: ItemCreateOrConnectWithoutParagraphInput | ItemCreateOrConnectWithoutParagraphInput[]
    upsert?: ItemUpsertWithWhereUniqueWithoutParagraphInput | ItemUpsertWithWhereUniqueWithoutParagraphInput[]
    createMany?: ItemCreateManyParagraphInputEnvelope
    set?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    disconnect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    delete?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    connect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    update?: ItemUpdateWithWhereUniqueWithoutParagraphInput | ItemUpdateWithWhereUniqueWithoutParagraphInput[]
    updateMany?: ItemUpdateManyWithWhereWithoutParagraphInput | ItemUpdateManyWithWhereWithoutParagraphInput[]
    deleteMany?: ItemScalarWhereInput | ItemScalarWhereInput[]
  }

  export type ItemUncheckedUpdateManyWithoutParagraphNestedInput = {
    create?: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput> | ItemCreateWithoutParagraphInput[] | ItemUncheckedCreateWithoutParagraphInput[]
    connectOrCreate?: ItemCreateOrConnectWithoutParagraphInput | ItemCreateOrConnectWithoutParagraphInput[]
    upsert?: ItemUpsertWithWhereUniqueWithoutParagraphInput | ItemUpsertWithWhereUniqueWithoutParagraphInput[]
    createMany?: ItemCreateManyParagraphInputEnvelope
    set?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    disconnect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    delete?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    connect?: ItemWhereUniqueInput | ItemWhereUniqueInput[]
    update?: ItemUpdateWithWhereUniqueWithoutParagraphInput | ItemUpdateWithWhereUniqueWithoutParagraphInput[]
    updateMany?: ItemUpdateManyWithWhereWithoutParagraphInput | ItemUpdateManyWithWhereWithoutParagraphInput[]
    deleteMany?: ItemScalarWhereInput | ItemScalarWhereInput[]
  }

  export type ParagraphCreateNestedOneWithoutItemsInput = {
    create?: XOR<ParagraphCreateWithoutItemsInput, ParagraphUncheckedCreateWithoutItemsInput>
    connectOrCreate?: ParagraphCreateOrConnectWithoutItemsInput
    connect?: ParagraphWhereUniqueInput
  }

  export type ParagraphUpdateOneRequiredWithoutItemsNestedInput = {
    create?: XOR<ParagraphCreateWithoutItemsInput, ParagraphUncheckedCreateWithoutItemsInput>
    connectOrCreate?: ParagraphCreateOrConnectWithoutItemsInput
    upsert?: ParagraphUpsertWithoutItemsInput
    connect?: ParagraphWhereUniqueInput
    update?: XOR<XOR<ParagraphUpdateToOneWithWhereWithoutItemsInput, ParagraphUpdateWithoutItemsInput>, ParagraphUncheckedUpdateWithoutItemsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type ArticleCreateWithoutLawInput = {
    id?: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
    paragraphs?: ParagraphCreateNestedManyWithoutArticleInput
  }

  export type ArticleUncheckedCreateWithoutLawInput = {
    id?: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
    paragraphs?: ParagraphUncheckedCreateNestedManyWithoutArticleInput
  }

  export type ArticleCreateOrConnectWithoutLawInput = {
    where: ArticleWhereUniqueInput
    create: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput>
  }

  export type ArticleCreateManyLawInputEnvelope = {
    data: ArticleCreateManyLawInput | ArticleCreateManyLawInput[]
    skipDuplicates?: boolean
  }

  export type ArticleUpsertWithWhereUniqueWithoutLawInput = {
    where: ArticleWhereUniqueInput
    update: XOR<ArticleUpdateWithoutLawInput, ArticleUncheckedUpdateWithoutLawInput>
    create: XOR<ArticleCreateWithoutLawInput, ArticleUncheckedCreateWithoutLawInput>
  }

  export type ArticleUpdateWithWhereUniqueWithoutLawInput = {
    where: ArticleWhereUniqueInput
    data: XOR<ArticleUpdateWithoutLawInput, ArticleUncheckedUpdateWithoutLawInput>
  }

  export type ArticleUpdateManyWithWhereWithoutLawInput = {
    where: ArticleScalarWhereInput
    data: XOR<ArticleUpdateManyMutationInput, ArticleUncheckedUpdateManyWithoutLawInput>
  }

  export type ArticleScalarWhereInput = {
    AND?: ArticleScalarWhereInput | ArticleScalarWhereInput[]
    OR?: ArticleScalarWhereInput[]
    NOT?: ArticleScalarWhereInput | ArticleScalarWhereInput[]
    id?: StringFilter<"Article"> | string
    lawId?: StringFilter<"Article"> | string
    articleNumber?: StringFilter<"Article"> | string
    articleTitle?: StringNullableFilter<"Article"> | string | null
    content?: StringFilter<"Article"> | string
    chapter?: StringNullableFilter<"Article"> | string | null
    section?: StringNullableFilter<"Article"> | string | null
    sortOrder?: IntFilter<"Article"> | number
    isDeleted?: BoolFilter<"Article"> | boolean
  }

  export type LawCreateWithoutArticlesInput = {
    id: string
    title: string
    lawType?: string | null
    lawNumber?: string | null
    promulgationDate?: Date | string | null
    effectiveDate?: Date | string | null
    xmlContent: string
    status?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LawUncheckedCreateWithoutArticlesInput = {
    id: string
    title: string
    lawType?: string | null
    lawNumber?: string | null
    promulgationDate?: Date | string | null
    effectiveDate?: Date | string | null
    xmlContent: string
    status?: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type LawCreateOrConnectWithoutArticlesInput = {
    where: LawWhereUniqueInput
    create: XOR<LawCreateWithoutArticlesInput, LawUncheckedCreateWithoutArticlesInput>
  }

  export type ParagraphCreateWithoutArticleInput = {
    id?: string
    paragraphNumber: number
    content: string
    items?: ItemCreateNestedManyWithoutParagraphInput
  }

  export type ParagraphUncheckedCreateWithoutArticleInput = {
    id?: string
    paragraphNumber: number
    content: string
    items?: ItemUncheckedCreateNestedManyWithoutParagraphInput
  }

  export type ParagraphCreateOrConnectWithoutArticleInput = {
    where: ParagraphWhereUniqueInput
    create: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput>
  }

  export type ParagraphCreateManyArticleInputEnvelope = {
    data: ParagraphCreateManyArticleInput | ParagraphCreateManyArticleInput[]
    skipDuplicates?: boolean
  }

  export type LawUpsertWithoutArticlesInput = {
    update: XOR<LawUpdateWithoutArticlesInput, LawUncheckedUpdateWithoutArticlesInput>
    create: XOR<LawCreateWithoutArticlesInput, LawUncheckedCreateWithoutArticlesInput>
    where?: LawWhereInput
  }

  export type LawUpdateToOneWithWhereWithoutArticlesInput = {
    where?: LawWhereInput
    data: XOR<LawUpdateWithoutArticlesInput, LawUncheckedUpdateWithoutArticlesInput>
  }

  export type LawUpdateWithoutArticlesInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type LawUncheckedUpdateWithoutArticlesInput = {
    id?: StringFieldUpdateOperationsInput | string
    title?: StringFieldUpdateOperationsInput | string
    lawType?: NullableStringFieldUpdateOperationsInput | string | null
    lawNumber?: NullableStringFieldUpdateOperationsInput | string | null
    promulgationDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    effectiveDate?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    xmlContent?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ParagraphUpsertWithWhereUniqueWithoutArticleInput = {
    where: ParagraphWhereUniqueInput
    update: XOR<ParagraphUpdateWithoutArticleInput, ParagraphUncheckedUpdateWithoutArticleInput>
    create: XOR<ParagraphCreateWithoutArticleInput, ParagraphUncheckedCreateWithoutArticleInput>
  }

  export type ParagraphUpdateWithWhereUniqueWithoutArticleInput = {
    where: ParagraphWhereUniqueInput
    data: XOR<ParagraphUpdateWithoutArticleInput, ParagraphUncheckedUpdateWithoutArticleInput>
  }

  export type ParagraphUpdateManyWithWhereWithoutArticleInput = {
    where: ParagraphScalarWhereInput
    data: XOR<ParagraphUpdateManyMutationInput, ParagraphUncheckedUpdateManyWithoutArticleInput>
  }

  export type ParagraphScalarWhereInput = {
    AND?: ParagraphScalarWhereInput | ParagraphScalarWhereInput[]
    OR?: ParagraphScalarWhereInput[]
    NOT?: ParagraphScalarWhereInput | ParagraphScalarWhereInput[]
    id?: StringFilter<"Paragraph"> | string
    articleId?: StringFilter<"Paragraph"> | string
    paragraphNumber?: IntFilter<"Paragraph"> | number
    content?: StringFilter<"Paragraph"> | string
  }

  export type ArticleCreateWithoutParagraphsInput = {
    id?: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
    law: LawCreateNestedOneWithoutArticlesInput
  }

  export type ArticleUncheckedCreateWithoutParagraphsInput = {
    id?: string
    lawId: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
  }

  export type ArticleCreateOrConnectWithoutParagraphsInput = {
    where: ArticleWhereUniqueInput
    create: XOR<ArticleCreateWithoutParagraphsInput, ArticleUncheckedCreateWithoutParagraphsInput>
  }

  export type ItemCreateWithoutParagraphInput = {
    id?: string
    itemNumber: string
    content: string
  }

  export type ItemUncheckedCreateWithoutParagraphInput = {
    id?: string
    itemNumber: string
    content: string
  }

  export type ItemCreateOrConnectWithoutParagraphInput = {
    where: ItemWhereUniqueInput
    create: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput>
  }

  export type ItemCreateManyParagraphInputEnvelope = {
    data: ItemCreateManyParagraphInput | ItemCreateManyParagraphInput[]
    skipDuplicates?: boolean
  }

  export type ArticleUpsertWithoutParagraphsInput = {
    update: XOR<ArticleUpdateWithoutParagraphsInput, ArticleUncheckedUpdateWithoutParagraphsInput>
    create: XOR<ArticleCreateWithoutParagraphsInput, ArticleUncheckedCreateWithoutParagraphsInput>
    where?: ArticleWhereInput
  }

  export type ArticleUpdateToOneWithWhereWithoutParagraphsInput = {
    where?: ArticleWhereInput
    data: XOR<ArticleUpdateWithoutParagraphsInput, ArticleUncheckedUpdateWithoutParagraphsInput>
  }

  export type ArticleUpdateWithoutParagraphsInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
    law?: LawUpdateOneRequiredWithoutArticlesNestedInput
  }

  export type ArticleUncheckedUpdateWithoutParagraphsInput = {
    id?: StringFieldUpdateOperationsInput | string
    lawId?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
  }

  export type ItemUpsertWithWhereUniqueWithoutParagraphInput = {
    where: ItemWhereUniqueInput
    update: XOR<ItemUpdateWithoutParagraphInput, ItemUncheckedUpdateWithoutParagraphInput>
    create: XOR<ItemCreateWithoutParagraphInput, ItemUncheckedCreateWithoutParagraphInput>
  }

  export type ItemUpdateWithWhereUniqueWithoutParagraphInput = {
    where: ItemWhereUniqueInput
    data: XOR<ItemUpdateWithoutParagraphInput, ItemUncheckedUpdateWithoutParagraphInput>
  }

  export type ItemUpdateManyWithWhereWithoutParagraphInput = {
    where: ItemScalarWhereInput
    data: XOR<ItemUpdateManyMutationInput, ItemUncheckedUpdateManyWithoutParagraphInput>
  }

  export type ItemScalarWhereInput = {
    AND?: ItemScalarWhereInput | ItemScalarWhereInput[]
    OR?: ItemScalarWhereInput[]
    NOT?: ItemScalarWhereInput | ItemScalarWhereInput[]
    id?: StringFilter<"Item"> | string
    paragraphId?: StringFilter<"Item"> | string
    itemNumber?: StringFilter<"Item"> | string
    content?: StringFilter<"Item"> | string
  }

  export type ParagraphCreateWithoutItemsInput = {
    id?: string
    paragraphNumber: number
    content: string
    article: ArticleCreateNestedOneWithoutParagraphsInput
  }

  export type ParagraphUncheckedCreateWithoutItemsInput = {
    id?: string
    articleId: string
    paragraphNumber: number
    content: string
  }

  export type ParagraphCreateOrConnectWithoutItemsInput = {
    where: ParagraphWhereUniqueInput
    create: XOR<ParagraphCreateWithoutItemsInput, ParagraphUncheckedCreateWithoutItemsInput>
  }

  export type ParagraphUpsertWithoutItemsInput = {
    update: XOR<ParagraphUpdateWithoutItemsInput, ParagraphUncheckedUpdateWithoutItemsInput>
    create: XOR<ParagraphCreateWithoutItemsInput, ParagraphUncheckedCreateWithoutItemsInput>
    where?: ParagraphWhereInput
  }

  export type ParagraphUpdateToOneWithWhereWithoutItemsInput = {
    where?: ParagraphWhereInput
    data: XOR<ParagraphUpdateWithoutItemsInput, ParagraphUncheckedUpdateWithoutItemsInput>
  }

  export type ParagraphUpdateWithoutItemsInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
    article?: ArticleUpdateOneRequiredWithoutParagraphsNestedInput
  }

  export type ParagraphUncheckedUpdateWithoutItemsInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleId?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ArticleCreateManyLawInput = {
    id?: string
    articleNumber: string
    articleTitle?: string | null
    content: string
    chapter?: string | null
    section?: string | null
    sortOrder?: number
    isDeleted?: boolean
  }

  export type ArticleUpdateWithoutLawInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
    paragraphs?: ParagraphUpdateManyWithoutArticleNestedInput
  }

  export type ArticleUncheckedUpdateWithoutLawInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
    paragraphs?: ParagraphUncheckedUpdateManyWithoutArticleNestedInput
  }

  export type ArticleUncheckedUpdateManyWithoutLawInput = {
    id?: StringFieldUpdateOperationsInput | string
    articleNumber?: StringFieldUpdateOperationsInput | string
    articleTitle?: NullableStringFieldUpdateOperationsInput | string | null
    content?: StringFieldUpdateOperationsInput | string
    chapter?: NullableStringFieldUpdateOperationsInput | string | null
    section?: NullableStringFieldUpdateOperationsInput | string | null
    sortOrder?: IntFieldUpdateOperationsInput | number
    isDeleted?: BoolFieldUpdateOperationsInput | boolean
  }

  export type ParagraphCreateManyArticleInput = {
    id?: string
    paragraphNumber: number
    content: string
  }

  export type ParagraphUpdateWithoutArticleInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
    items?: ItemUpdateManyWithoutParagraphNestedInput
  }

  export type ParagraphUncheckedUpdateWithoutArticleInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
    items?: ItemUncheckedUpdateManyWithoutParagraphNestedInput
  }

  export type ParagraphUncheckedUpdateManyWithoutArticleInput = {
    id?: StringFieldUpdateOperationsInput | string
    paragraphNumber?: IntFieldUpdateOperationsInput | number
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemCreateManyParagraphInput = {
    id?: string
    itemNumber: string
    content: string
  }

  export type ItemUpdateWithoutParagraphInput = {
    id?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemUncheckedUpdateWithoutParagraphInput = {
    id?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }

  export type ItemUncheckedUpdateManyWithoutParagraphInput = {
    id?: StringFieldUpdateOperationsInput | string
    itemNumber?: StringFieldUpdateOperationsInput | string
    content?: StringFieldUpdateOperationsInput | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}