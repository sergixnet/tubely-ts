import { respondWithJSON } from './json';

import { type ApiConfig } from '../config';
import type { BunRequest } from 'bun';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import { getBearerToken, validateJWT } from '../auth';
import { getVideo, updateVideo } from '../db/videos';
import { getAssetTempPath, getBucketObjectURL, mediaTypeToExt } from './assets';
import { randomBytes } from 'crypto';
import { getVideoAspectRatio } from './video-meta';

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const videoData = await getVideo(cfg.db, videoId);

  if (!videoData) {
    throw new NotFoundError('Video not found');
  }

  if (videoData.userID !== userID) {
    throw new UserForbiddenError(`Not authorized to upload the video`);
  }

  console.log('uploading video', videoId, 'by user', userID);

  const formData = await req.formData();
  const video = formData.get('video');

  if (!(video instanceof File)) {
    throw new BadRequestError('Video is not a file');
  }

  const MAX_UPLOAD_SIZE = 1 << 30;

  if (video.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Max upload size exceeded');
  }

  const allowedMimeTypes = ['video/mp4'];

  const mediaType = video.type;
  if (!allowedMimeTypes.includes(mediaType)) {
    throw new BadRequestError(`Not valid MIME type`);
  }

  const extension = mediaTypeToExt(mediaType);
  const fileName = `${randomBytes(32).toString('base64url')}${extension}`;
  const filePath = getAssetTempPath(fileName);
  const videoFileData = await video.arrayBuffer();

  await Bun.write(filePath, videoFileData);

  const aspectRatio = await getVideoAspectRatio(filePath);
  const key = `${aspectRatio}/${fileName}`;

  const videoFile = Bun.file(filePath);

  const s3File = cfg.s3Client.file(key, {
    type: videoFile.type,
  });
  await s3File.write(videoFileData);

  const videoURL = getBucketObjectURL(cfg, key);
  videoData.videoURL = videoURL;

  updateVideo(cfg.db, videoData);

  await Bun.file(filePath).delete();

  return respondWithJSON(200, null);
}
