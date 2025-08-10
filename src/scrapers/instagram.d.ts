export interface InstagramResponse {
  source_url:string;
  user: {
    id: string;
    username: string;
    fullname: string;
    is_verified: boolean;
  };
  video: {
    id: string;
    duration: double;
    thumbnail_url: string;
    video_url: string;
    caption: string;
  };
}
export interface InstagramError {
  error: string;
}
export declare function instagramGetUrl(
  url_media: string,
  config?: {
    retries: number;
    delay: number;
  }, 
  csrfToken: string
): Promise<InstagramResponse>;

export declare function getCSRFToken(providedToken?: string): Promise<string>;

//  sourceUrl: sourceUrl,
//             user: {
//               id: userId,
//               username: username,
//               fullname: fullname,
//               is_verified: isVerified,
//             },
//             video: {
//               id: videoId,
//               duration: videoDuration,
//               thumbnail_url: thumbnailUrl,
//               video_url: sourceUrl.includes("/p/") ? thumbnailUrl : videoUrl,
//               caption: caption,
//             },
