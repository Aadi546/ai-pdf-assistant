import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ObjectStorage } from "./object-storage.interface";

/**
 * S3-protocol implementation of ObjectStorage. Works unmodified against
 * MinIO (local dev), Cloudflare R2, or real AWS S3 — they all speak the same
 * API, we just point STORAGE_ENDPOINT at whichever one is configured.
 */
@Injectable()
export class S3ObjectStorageService implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(S3ObjectStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.getOrThrow<string>("STORAGE_BUCKET");
    this.client = new S3Client({
      endpoint: this.config.getOrThrow<string>("STORAGE_ENDPOINT"),
      region: this.config.get<string>("STORAGE_REGION") ?? "us-east-1",
      credentials: {
        accessKeyId: this.config.getOrThrow<string>("STORAGE_ACCESS_KEY"),
        secretAccessKey: this.config.getOrThrow<string>("STORAGE_SECRET_KEY"),
      },
      // MinIO (and most non-AWS S3-compatible providers) need path-style
      // addressing (host/bucket/key) instead of AWS's virtual-hosted style
      // (bucket.host/key) — harmless to leave on for real S3 too.
      forcePathStyle: true,
    });
  }

  async onModuleInit() {
    // Dev convenience: MinIO doesn't come with the bucket pre-created, and
    // failing every upload with "bucket does not exist" on first `docker
    // compose up` is a bad first-run experience. In prod the bucket is
    // expected to already exist (created by infra/Terraform), so this is a
    // harmless no-op there.
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created object storage bucket "${this.bucket}"`);
      } catch (err) {
        this.logger.warn(`Could not verify/create bucket "${this.bucket}": ${(err as Error).message}`);
      }
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Object "${key}" returned no body`);
    }
    return Buffer.from(bytes);
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
