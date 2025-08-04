export declare class Configuration {
    private readonly env;
    private static instance;
    private constructor();
    static getInstance(): Configuration;
    get database(): {
        postgres: {
            url: string;
            poolSize: number;
        };
        neo4j: {
            uri: string;
            user: string;
            password: string;
        };
        redis: {
            url: string;
        };
        elasticsearch: {
            node: string;
        };
    };
    get api(): {
        baseUrl: string;
        apiKey: string;
        timeout: number;
    };
    get dataPath(): {
        xmlDirectory: string;
        cacheDirectory: string;
    };
    get llm(): {
        model: string;
        endpoint: string;
        timeout: number;
    };
    get app(): {
        port: number;
        env: string;
        logLevel: string;
    };
    get jwt(): {
        secret: string;
        expiresIn: string;
        refreshExpiresIn: string;
    };
}
//# sourceMappingURL=Configuration.d.ts.map