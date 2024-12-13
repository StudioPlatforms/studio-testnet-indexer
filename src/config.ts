interface Config {
    rpc: {
        url: string;
        ws_url: string;
    };
    database: {
        connection_string: string;
    };
    api: {
        port: number;
    };
}

const config: Config = {
    rpc: {
        url: process.env.RPC_URL || 'http://localhost:8545',
        ws_url: process.env.WS_URL || 'ws://localhost:8546'
    },
    database: {
        connection_string: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/indexer'
    },
    api: {
        port: parseInt(process.env.API_PORT || '3001')
    }
};

export default config;
