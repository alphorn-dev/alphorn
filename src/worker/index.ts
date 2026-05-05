import { getQueue, DELIVERY_QUEUE } from "@/lib/queue";
import { handleDelivery, type DeliveryJobData } from "./deliver";
import { startSweep } from "./sweep";
import { startRetentionSweep } from "./retention";
import type { Job } from "pg-boss";
import { logger } from "@/lib/logger";

// Import channels to trigger registration
import "@/channels";

export async function startWorker() {
  const queue = await getQueue();

  await queue.createQueue(DELIVERY_QUEUE, {
    retryLimit: 5,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,       // 5 min timeout per active job
    deleteAfterSeconds: 604800, // purge completed jobs after 7 days
    retentionSeconds: 1209600,  // drop unstarted jobs after 14 days
  });

  const concurrency = Number(process.env.WORKER_CONCURRENCY) || 20;
  await queue.work<DeliveryJobData>(
    DELIVERY_QUEUE,
    { localConcurrency: concurrency },
    async (jobs: Job<DeliveryJobData>[]) => {
      await Promise.all(jobs.map((job) => handleDelivery(job.data)));
    }
  );

  startSweep();
  startRetentionSweep();

  logger.info({ component: "worker", concurrency }, "Worker started");
}
