import neo4j, { Driver, Session } from 'neo4j-driver';
import * as dotenv from 'dotenv';

// 環境変数を読み込む
dotenv.config();

let driver: Driver | null = null;

/**
 * Neo4jドライバーの初期化
 */
export function initNeo4jDriver(): Driver {
  if (driver) {
    return driver;
  }

  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  
  return driver;
}

/**
 * Neo4jセッションの作成
 */
export function getNeo4jSession(): Session {
  const driver = initNeo4jDriver();
  return driver.session();
}

/**
 * Neo4j接続のクローズ
 */
export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Neo4jヘルスチェック
 */
export async function checkNeo4jConnection(): Promise<boolean> {
  const session = getNeo4jSession();
  try {
    await session.run('RETURN 1');
    return true;
  } catch (error) {
    console.error('Neo4j connection failed:', error);
    return false;
  } finally {
    await session.close();
  }
}