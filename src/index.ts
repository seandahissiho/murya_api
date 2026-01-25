import express from 'express';
import dotenv from 'dotenv';
import bodyParser from "body-parser";
import morgan from "morgan";
import cors from "cors";
import router from "./routes/index.routes";
import path from "path";
// import {parseDateStrings} from "./utils/parseDateStrings";
import {initRedis} from "./config/redis";
import {startQuizGenerationWorker} from "./services/quiz_generation.worker";
import {startArticleGenerationWorker} from "./services/article_generation.worker";

dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
    if (value === undefined) return defaultValue;
    return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
};
const runHttp = parseBoolean(process.env.RUN_HTTP, true);
const runWorkers = parseBoolean(process.env.RUN_WORKERS, true);

app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});


app.use(bodyParser.json({limit: "5mb"}));
app.use(bodyParser.urlencoded({extended: true, limit: "5mb"}));

// app.use(parseDateStrings);

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
// const baseDir = path.join(process.cwd(), "private_uploads"); // not publicly served

app.use(morgan("dev"));

app.use(cors());

app.use("/api", router);


app.get("/", (_, res) => res.json({ ok: true }));


const startWorkers = async () => {
    try {
        const client = await initRedis();
        if (client) {
            startQuizGenerationWorker();
            startArticleGenerationWorker();
        }
    } catch (err) {
        console.error('Failed to initialize Redis', err);
    }
};

if (runHttp) {
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server listening on http://0.0.0.0:${port}`);
    });
} else {
    console.log('HTTP server disabled (RUN_HTTP=false).');
}

if (runWorkers) {
    startWorkers();
} else {
    console.log('Workers disabled (RUN_WORKERS=false).');
}

export default app;
