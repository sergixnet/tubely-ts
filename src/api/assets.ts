import { existsSync, mkdirSync } from 'fs';
import { s3 } from 'bun';

import type { ApiConfig } from '../config';
import path from 'path';
import type { Video } from '../db/videos';

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function mediaTypeToExt(mediaType: string) {
  const parts = mediaType.split('/');
  if (parts.length !== 2) {
    return '.bin';
  }
  return '.' + parts[1];
}

export function getAssetDiskPath(cfg: ApiConfig, assetPath: string) {
  return path.join(cfg.assetsRoot, assetPath);
}

export function getAssetTempPath(assetPath: string) {
  return path.join(`/tmp/`, assetPath);
}

export function getAssetURL(cfg: ApiConfig, assetPath: string) {
  return `http://localhost:${cfg.port}/assets/${assetPath}`;
}

export function getBucketObjectURL(cfg: ApiConfig, key: string) {
  return `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;
}

export function generatePresignedURL(
  cfg: ApiConfig,
  key: string,
  expireTime: number
) {
  return cfg.s3Client.presign(key, { expiresIn: expireTime });
}

export function dbVideoToSignedVideo(cfg: ApiConfig, video: Video) {
  if (!video.videoURL) {
    return video;
  }

  const ONE_MINUTE_IN_SECONDS = 60;

  const preSignedURL = generatePresignedURL(
    cfg,
    video.videoURL,
    ONE_MINUTE_IN_SECONDS
  );
  video.videoURL = preSignedURL;
  return video;
}
