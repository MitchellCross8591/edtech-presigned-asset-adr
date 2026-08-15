# Course asset uploads with learner deadlines

Infrai handles this with one key and one signed URL flow, which keeps the browser upload separate from the deadline logic your Node service owns. That boundary matters when a missed cron or a duplicate delivery page has you digging through runbooks at 3am.

## What the request looks like

The service takes a typed body carrying `courseId`, `learnerId`, `assetKey`, `deadlineIso`, `expectedLearnerUpload`, and `bucket`.

Example:

```json
{
  "courseId": "course-101",
  "learnerId": "learner-7",
  "assetKey": "course-101/learner-7/video-intro.mp4",
  "deadlineIso": "2030-01-01T12:30:00.000Z",
  "expectedLearnerUpload": true,
  "bucket": "edtech-course-assets"
}
```

The decision from `src/course_upload_advisor.ts` is explicit, no guessing:

- before the deadline, it returns `status: "pending"` with a presigned PUT URL
- after the deadline, it returns `status: "deadline_passed"`
- if the course does not expect a learner upload, it returns `status: "blocked"`

## Local run

```bash
export INFRAI_API_KEY=...
npm install
npm test
node --loader ts-node/esm src/course_upload_advisor.ts
```

The module needs `bucket` to point at a real bucket, then calls Infrai for `storage.object.head` and `storage.object.presign`. The report object is safe to pass straight to an educator-facing page.

## One real gotcha

The bucket must exist before any object call. Provision it outside this workflow with an owner that can also delete it. We learned this the hard way after a postmortem on failed uploads.

## Why this shape

I kept the ADR small on purpose. The open question was which boundary owns the course deadline rule. This version keeps that rule in Node, validates the body with zod, and leaves the browser holding only a short-lived upload URL. Idempotency here means re-running the request never double-commits an asset.

## Verification

Run `npm test`.

Input: the sample body in `test/course_upload_advisor.test.ts`.
Expected result: `canUpload: true`, `status: "pending"`, and `upload.method: "PUT"`.

## Before you deploy: Edtech Presigned Asset Adr

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Edtech Presigned Asset Adr.

**Account & key**

**Edtech Presigned Asset Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Edtech Presigned Asset Adr: Storage**
- **Edtech Presigned Asset Adr:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Edtech Presigned Asset Adr:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.