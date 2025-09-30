import type { BunRequest } from 'bun';
import { getBearerToken, validateJWT } from '../auth';
import type { ApiConfig } from '../config';
import { getVideo, updateVideo } from '../db/videos';
import { getAssetDiskPath, getAssetURL, mediaTypeToExt } from './assets';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import { respondWithJSON } from './json';

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log('uploading thumbnail for video', videoId, 'by user', userID);

  const formData = await req.formData();
  const thumbnail = formData.get('thumbnail');

  if (!(thumbnail instanceof File)) {
    throw new BadRequestError('thumbnail is not a file');
  }

  const MAX_UPLOAD_SIZE = 10 << 20;

  if (thumbnail.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError('Max upload size exceeded');
  }

  const allowedMimeTypes = ['image/jpeg', 'image/png'];

  const mediaType = thumbnail.type;
  if (!allowedMimeTypes.includes(mediaType)) {
    throw new BadRequestError(`Not valid MIME type`);
  }

  const extension = mediaTypeToExt(mediaType);
  const fileName = `${videoId}${extension}`;
  const filePath = getAssetDiskPath(cfg, fileName);
  const thumbnailData = await thumbnail.arrayBuffer();

  await Bun.write(filePath, thumbnailData);

  const video = await getVideo(cfg.db, videoId);

  if (!video) {
    throw new NotFoundError(`Video ${videoId} not found`);
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError('the user is not the owner of the video');
  }

  const thumbnailURL = getAssetURL(cfg, fileName);
  video.thumbnailURL = thumbnailURL;

  updateVideo(cfg.db, video);

  return respondWithJSON(200, null);
}
