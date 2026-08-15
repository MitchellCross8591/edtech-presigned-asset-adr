import { z } from "zod";
import { infrai } from "./infrai.js";

const InputSchema = z.object({
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  assetKey: z.string().min(1),
  deadlineIso: z.string().datetime(),
  expectedLearnerUpload: z.boolean(),
  bucket: z.string().min(1)
});

export type CourseUploadRequest = z.infer<typeof InputSchema>;

export type CourseUploadDecision = {
  canUpload: boolean;
  status: "pending" | "deadline_passed" | "blocked" | "ready";
  upload?: { url: string; method: string; expiresSeconds: number };
  report: {
    courseId: string;
    learnerId: string;
    assetKey: string;
    bucket: string;
    deadlineIso: string;
    objectPresent: boolean;
  };
};

function minutesUntil(deadlineIso: string, now = new Date()): number {
  return Math.floor((new Date(deadlineIso).getTime() - now.getTime()) / 60000);
}

export async function decideCourseUpload(input: CourseUploadRequest, now = new Date()): Promise<CourseUploadDecision> {
  const parsed = InputSchema.parse(input);

  const head = await infrai.storage.object.head(parsed.bucket, parsed.assetKey);
  const objectPresent = head.found;
  const minsLeft = minutesUntil(parsed.deadlineIso, now);

  if (!parsed.expectedLearnerUpload) {
    return {
      canUpload: false,
      status: "blocked",
      report: {
        courseId: parsed.courseId,
        learnerId: parsed.learnerId,
        assetKey: parsed.assetKey,
        bucket: parsed.bucket,
        deadlineIso: parsed.deadlineIso,
        objectPresent
      }
    };
  }

  if (minsLeft <= 0) {
    return {
      canUpload: false,
      status: "deadline_passed",
      report: {
        courseId: parsed.courseId,
        learnerId: parsed.learnerId,
        assetKey: parsed.assetKey,
        bucket: parsed.bucket,
        deadlineIso: parsed.deadlineIso,
        objectPresent
      }
    };
  }

  const presign = await infrai.storage.object.presign(parsed.bucket, parsed.assetKey, {
    op: "put",
    expires_seconds: Math.min(900, minsLeft * 60),
    content_type: "application/octet-stream",
    idempotency_key: `${parsed.courseId}:${parsed.learnerId}:${parsed.assetKey}`
  });

  return {
    canUpload: true,
    status: objectPresent ? "ready" : "pending",
    upload: {
      url: presign.url,
      method: presign.method,
      expiresSeconds: Math.min(900, minsLeft * 60)
    },
    report: {
      courseId: parsed.courseId,
      learnerId: parsed.learnerId,
      assetKey: parsed.assetKey,
      bucket: parsed.bucket,
      deadlineIso: parsed.deadlineIso,
      objectPresent
    }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sample = {
    courseId: "course-101",
    learnerId: "learner-7",
    assetKey: "course-101/learner-7/video-intro.mp4",
    deadlineIso: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    expectedLearnerUpload: true,
    bucket: "edtech-course-assets"
  };

  decideCourseUpload(sample)
    .then((decision) => {
      console.log(JSON.stringify(decision, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
