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

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

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


app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
    initRedis().then((client) => {
        if (client) {
            startQuizGenerationWorker();
        }
    }).catch((err) => {
        console.error('Failed to initialize Redis', err);
    });
    // Optional: run once at boot (useful after restarts)
    // (Comment out if you strictly want it only at 08:00)

});

export default app;
