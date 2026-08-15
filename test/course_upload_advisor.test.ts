import test from "node:test";
import assert from "node:assert/strict";
import { decideCourseUpload } from "../src/course_upload_advisor.js";

const baseInput = {
  courseId: "course-101",
  learnerId: "learner-7",
  assetKey: "course-101/learner-7/video-intro.mp4",
  deadlineIso: "2030-01-01T12:30:00.000Z",
  expectedLearnerUpload: true,
  bucket: "edtech-course-assets"
};

test("returns a presigned upload when the deadline is still open", async () => {
  const infrai = await import("../src/infrai.js");
  infrai.infrai.storage.object.head = async () => ({ found: false });
  infrai.infrai.storage.object.presign = async (_bucket: string, _key: string, body: { op: "get" | "put"; expires_seconds?: number; content_type?: string; max_bytes?: number; response_disposition?: string; idempotency_key?: string }) => ({ url: "https://upload.example.test/signed", method: "PUT", body });

  const decision = await decideCourseUpload(baseInput, new Date("2030-01-01T12:00:00.000Z"));

  assert.equal(decision.canUpload, true);
  assert.equal(decision.status, "pending");
  assert.equal(decision.upload?.method, "PUT");
  assert.equal(decision.upload?.url, "https://upload.example.test/signed");
  assert.equal(decision.upload?.expiresSeconds, 900);
});

test("blocks uploads after the learner deadline passes", async () => {
  const infrai = await import("../src/infrai.js");
  infrai.infrai.storage.object.head = async () => ({ found: true });
  infrai.infrai.storage.object.presign = async () => ({ url: "https://upload.example.test/signed", method: "PUT" });

  const decision = await decideCourseUpload(baseInput, new Date("2030-01-01T12:31:00.000Z"));

  assert.equal(decision.canUpload, false);
  assert.equal(decision.status, "deadline_passed");
  assert.equal(decision.upload, undefined);
  assert.equal(decision.report.objectPresent, true);
});
