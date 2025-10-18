import type { BunRequest } from 'bun';
import { getBearerToken, validateJWT } from '../auth';
import { type ApiConfig } from '../config';
import { createVideo, deleteVideo, getVideo, getVideos } from '../db/videos';
import { BadRequestError, NotFoundError, UserForbiddenError } from './errors';
import { respondWithJSON } from './json';
import { dbVideoToSignedVideo } from './assets';

export async function handlerVideoMetaCreate(cfg: ApiConfig, req: Request) {
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const { title, description } = await req.json();
  if (!title || !description) {
    throw new BadRequestError('Missing title or description');
  }

  const video = createVideo(cfg.db, {
    userID,
    title,
    description,
  });

  return respondWithJSON(201, video);
}

export async function handlerVideoMetaDelete(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError('Not authorized to delete this video');
  }

  deleteVideo(cfg.db, videoId);
  return new Response(null, { status: 204 });
}

export async function handlerVideoGet(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError('Invalid video ID');
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  return respondWithJSON(200, dbVideoToSignedVideo(cfg, video));
}

export async function handlerVideosRetrieve(cfg: ApiConfig, req: Request) {
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const videos = getVideos(cfg.db, userID);
  const result = videos.map((video) => dbVideoToSignedVideo(cfg, video));

  return respondWithJSON(200, result);
}

export async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn([
    'ffprobe',
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    filePath,
  ]);

  await proc.exited;

  const outputText = await new Response(proc.stdout).text();
  const outputError = await new Response(proc.stderr).text();

  if (proc.exitCode !== 0) {
    throw new Error(`ffprobe error: ${outputError}`);
  }

  const output = JSON.parse(outputText);

  if (!output.streams || output.streams.length === 0) {
    throw new Error('No video streams found');
  }

  const { width, height } = output.streams[0];

  const ratio = width / height;
  const tolerance = 0.01;

  if (Math.abs(ratio - 16 / 9) < tolerance) {
    return 'landscape';
  }
  if (Math.abs(ratio - 9 / 16) < tolerance) {
    return 'portrait';
  }

  return 'other';
}

export async function processVideoForFastStart(inputFilePath: string) {
  const processedFilePath = `${inputFilePath}.processed`;

  const proc = Bun.spawn([
    'ffmpeg',
    '-i',
    inputFilePath,
    '-movflags',
    'faststart',
    '-map_metadata',
    '0',
    '-codec',
    'copy',
    '-f',
    'mp4',
    processedFilePath,
  ]);

  await proc.exited;

  const outputError = await new Response(proc.stderr).text();

  if (proc.exitCode !== 0) {
    throw new Error(`ffmpeg error: ${outputError}`);
  }

  return processedFilePath;
}
