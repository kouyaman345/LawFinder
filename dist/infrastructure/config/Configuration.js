"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Configuration = void 0;
class Configuration {
    env;
    static instance;
    constructor(env) {
        this.env = env;
    }
    static getInstance() {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration(process.env);
        }
        return Configuration.instance;
    }
    get database() {
        return {
            postgres: {
                url: this.env.DATABASE_URL || 'postgresql://localhost:5432/lawfinder',
                poolSize: parseInt(this.env.DB_POOL_SIZE || '10')
            },
            neo4j: {
                uri: this.env.NEO4J_URI || 'bolt://localhost:7687',
                user: this.env.NEO4J_USER || 'neo4j',
                password: this.env.NEO4J_PASSWORD || 'password'
            },
            redis: {
                url: this.env.REDIS_URL || 'redis://localhost:6379'
            },
            elasticsearch: {
                node: this.env.ELASTICSEARCH_URL || 'http://localhost:9200'
            }
        };
    }
    get api() {
        return {
            baseUrl: this.env.LAW_API_BASE_URL || 'https://api.e-gov.go.jp/laws/v1',
            apiKey: this.env.LAW_API_KEY || '',
            timeout: parseInt(this.env.LAW_API_TIMEOUT || '30000')
        };
    }
    get dataPath() {
        return {
            xmlDirectory: this.env.XML_DATA_PATH || './laws_data',
            cacheDirectory: this.env.CACHE_DATA_PATH || './cache'
        };
    }
    get llm() {
        return {
            model: this.env.LLM_MODEL || 'llama3-elyza-jp-8b',
            endpoint: this.env.LLM_ENDPOINT || 'http://localhost:11434',
            timeout: parseInt(this.env.LLM_TIMEOUT || '30000')
        };
    }
    get app() {
        return {
            port: parseInt(this.env.PORT || '3000'),
            env: this.env.NODE_ENV || 'development',
            logLevel: this.env.LOG_LEVEL || 'info'
        };
    }
    get jwt() {
        return {
            secret: this.env.JWT_SECRET || 'default-secret-change-in-production',
            expiresIn: this.env.JWT_EXPIRES_IN || '24h',
            refreshExpiresIn: this.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
        };
    }
}
exports.Configuration = Configuration;
//# sourceMappingURL=Configuration.js.map