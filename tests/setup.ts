/**
 * Jestテスト環境のセットアップ
 */

// タイムアウトの設定
jest.setTimeout(10000);

// グローバルモックの設定
global.console = {
  ...console,
  // テスト中の不要なログを抑制
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // エラーとwarningは表示
  warn: console.warn,
  error: console.error,
};

// データベース接続のモック
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    law: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    lawVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reference: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Neo4jドライバーのモック
jest.mock('neo4j-driver', () => ({
  driver: jest.fn(() => ({
    session: jest.fn(() => ({
      run: jest.fn(),
      close: jest.fn(),
    })),
    close: jest.fn(),
  })),
  auth: {
    basic: jest.fn(),
  },
}));

// ファイルシステムのモック（必要に応じて）
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn((path: string) => {
    // テスト用のダミーデータを返す
    if (path.includes('.xml')) {
      return '<Law><Article>テスト条文</Article></Law>';
    }
    if (path.includes('.csv')) {
      return 'id,title\n123AC0000000001,テスト法';
    }
    return '';
  }),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  readdirSync: jest.fn(() => []),
}));

// 環境変数の設定
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

export {};