import { getBearerToken, validateJWT } from '../auth';
import { respondWithJSON } from './json';
import { getVideo, updateVideo } from '../db/videos';
import type { ApiConfig } from '../config';
import type { BunRequest } from 'bun';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';

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

  const mediaType = thumbnail.type;
  const thumbnailData = await thumbnail.arrayBuffer();
  const thumbnailBase64 = Buffer.from(thumbnailData).toString('base64');

  const video = await getVideo(cfg.db, videoId);

  if (!video) {
    throw new NotFoundError(`Video ${videoId} not found`);
  }

  if (video.userID !== userID) {
    throw new UserForbiddenError('the user is not the owner of the video');
  }

  const thumbnailURL = `data:${mediaType};base64,${thumbnailBase64}`;
  video.thumbnailURL = thumbnailURL;

  updateVideo(cfg.db, video);

  return respondWithJSON(200, null);
}
