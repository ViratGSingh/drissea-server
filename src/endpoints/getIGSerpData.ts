
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
interface SerpShortVideoItem {
  position: number;
  title: string;
  link: string;
  thumbnail: string;
  clip: string;
  source: string;
  source_icon: string;
  channel: string;
  duration: string;
}

export interface YouTubeSerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    youtube_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    search_query: string;
  };
  search_information: {
    total_results: number;
    video_results_state?: string;
  };
  video_results?: YouTubeVideoResult[];
  shorts_results?: YouTubeShortsGroup[];
  movie_results?: YouTubeMovieResult[];
  channel_results?: YouTubeChannelResult[];
  latest_from_star_wars?: YouTubeVideoResult[];
  channels_new_to_you?: YouTubeVideoResult[];
  pagination?: {
    current: string;
    next?: string;
    next_page_token?: string;
  };
  serpapi_pagination?: {
    current: string;
    next?: string;
    next_page_token?: string;
  };
}

export interface YouTubeVideoResult {
  position_on_page: number | string;
  title: string;
  link: string;
  serpapi_link: string;
  channel: {
    name: string;
    link: string;
    verified?: boolean;
    thumbnail: string;
  };
  published_date?: string;
  views?: number;
  length?: string;
  description?: string;
  extensions?: string[];
  info?: string[];
  thumbnail: {
    static: string;
    rich?: string;
  } | string;
}

export interface YouTubeShortsGroup {
  position_on_page: number;
  shorts: YouTubeShort[];
}

export interface YouTubeShort {
  title: string;
  link: string;
  thumbnail: string;
  views_original: string;
  views: number;
  video_id: string;
}

export interface YouTubeMovieResult {
  position_on_page: number;
  title: string;
  link: string;
  serpapi_link: string;
  channel: {
    name: string;
    verified?: boolean;
    thumbnail: string;
  };
  length: string;
  description: string;
  info: string[];
  extensions?: string[];
  thumbnail: string;
}

export interface YouTubeChannelResult {
  position_on_page: number;
  title: string;
  link: string;
  verified?: boolean;
  handle?: string;
  subscribers?: number;
  description?: string;
  thumbnail: string;
}

interface AltSerpApiResponse {
  short_video_results?: SerpShortVideoItem[];
  video_results?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}



interface IGReelsApiResponse {
  reels_serp_modules: ReelsSerpModule[];
  has_more: boolean;
  reels_max_id: string;
  page_index: number;
  rank_token: string;
  status: string;
}

interface ReelsSerpModule {
  module_type: string; // e.g., "clips"
  clips: Clip[];
}

interface Clip {
  media: Media;
}

interface Media {
  fbid: number;
  deleted_reason: number;
  pk: number;
  id: string;
  strong_id__: string;
  has_delayed_metadata: boolean;
  mezql_token: string;
  share_count_disabled: boolean;
  should_request_ads: boolean;
  is_reshare_of_text_post_app_media_in_ig: boolean;
  integrity_review_decision: string;
  collaborator_edit_eligibility: boolean;
  client_cache_key: string;
  has_privately_liked: boolean;
  is_visual_reply_commenter_notice_enabled: boolean;
  translated_langs_for_autodub: any[];
  is_quiet_post: boolean;
  subtype_name_for_REST__: string;
  play_count: number;
  ig_play_count: number;
  are_remixes_crosspostable: boolean;
  is_third_party_downloads_eligible: boolean;
  has_audio: boolean;
  video_duration: number;
  is_dash_eligible: number;
  reshare_count: number;
  image_versions2: ImageVersions2;
  ig_media_sharing_disabled: boolean;
  media_cropping_info: MediaCroppingInfo;
  media_type: number;
  original_width: number;
  original_height: number;
  organic_tracking_token: string;
  avatar_stickers: any[];
  caption?: Caption;
  coauthor_producers: any[];
  music_metadata: any | null;
  sharing_friction_info: SharingFrictionInfo;
  has_tagged_users: boolean;
  media_repost_count: number;
  clips_tab_pinned_user_ids: any[];
  clips_metadata: ClipsMetadata;
  video_versions: VideoVersion[];
  video_dash_manifest: string;
  number_of_qualities: number;
  video_codec: string;
  like_count: number;
  comment_count: number;
  taken_at: number;
  photo_of_you: boolean;
  can_see_insights_as_brand: boolean;
  fundraiser_tag: FundraiserTag;
  timeline_pinned_user_ids: any[];
  creator_viewer_insights: any[];
  fb_user_tags: FBUserTags;
  coauthor_producer_can_see_organic_insights: boolean;
  invited_coauthor_producers: any[];
  media_overlay_info: any | null;
  is_in_profile_grid: boolean;
  profile_grid_control_enabled: boolean;
  user: IGUser;
  is_artist_pick: boolean;
  media_notes: MediaNotes;
  product_type: string;
  is_paid_partnership: boolean;
  social_context: any[];
  crosspost_metadata: CrosspostMetadata;
  [key: string]: any; // catch-all for extra fields
}

interface ImageVersions2 {
  additional_candidates: Record<string, ImageCandidate>;
  candidates: ImageCandidate[];
  scrubber_spritesheet_info_candidates: Record<string, ScrubberSpritesheetInfo>;
}

interface ImageCandidate {
  estimated_scans_sizes: number[];
  height: number;
  width: number;
  scans_profile?: string;
  url: string;
}

interface ScrubberSpritesheetInfo {
  file_size_kb: number;
  max_thumbnails_per_sprite: number;
  rendered_width: number;
  sprite_height: number;
  sprite_urls: string[];
  sprite_width: number;
  thumbnail_duration: number;
  thumbnail_height: number;
  thumbnail_width: number;
  thumbnails_per_row: number;
  total_thumbnail_num_per_sprite: number;
  video_length: number;
}

interface MediaCroppingInfo {
  four_by_three_crop: {
    crop_left: number;
    crop_right: number;
    crop_top: number;
    crop_bottom: number;
  };
}

interface Caption {
  bit_flags: number;
  created_at: number;
  created_at_utc: number;
  did_report_as_spam: boolean;
  is_ranked_comment: boolean;
  pk: string;
  share_enabled: boolean;
  content_type: string;
  media_id: number;
  status: string;
  type: number;
  user_id: number;
  strong_id__: string;
  text: string;
  user: IGUser;
  is_covered: boolean;
  private_reply_status: number;
  text_translation: string;
}

interface SharingFrictionInfo {
  should_have_sharing_friction: boolean;
  bloks_app_url: string | null;
  sharing_friction_payload: any | null;
}

interface ClipsMetadata {
  clips_creation_entry_point: string;
  featured_label: string | null;
  is_public_chat_welcome_video: boolean;
  professional_clips_upsell_type: number;
  show_tips: any | null;
  achievements_info: {
    num_earned_achievements: number | null;
    show_achievements: boolean;
  };
  [key: string]: any; // other nested properties skipped for brevity
}

interface VideoVersion {
  bandwidth: number;
  height: number;
  id: string;
  type: number;
  url: string;
  url_expiration_timestamp_us: number | null;
  width: number;
  fallback: string | null;
}

interface FundraiserTag {
  has_standalone_fundraiser: boolean;
}

interface FBUserTags {
  in: any[];
}

interface IGUser {
  fbid_v2: number;
  feed_post_reshare_disabled: boolean;
  full_name: string;
  id: string;
  is_unpublished: boolean;
  pk: number;
  pk_id: string;
  strong_id__: string;
  third_party_downloads_enabled: number;
  account_type: number;
  account_badges: any[];
  fan_club_info: any;
  friendship_status: any;
  has_anonymous_profile_picture: boolean;
  is_favorite: boolean;
  is_private: boolean;
  is_ring_creator: boolean;
  show_ring_award: boolean;
  is_verified: boolean;
  profile_pic_id: string;
  profile_pic_url: string;
  show_account_transparency_details: boolean;
  transparency_product_enabled: boolean;
  username: string;
  latest_reel_media?: number;
  eligible_for_text_app_activation_badge?: boolean;
  user_activation_info?: any;
}

interface MediaNotes {
  items: any[];
}

interface CrosspostMetadata {
  fb_downstream_use_xpost_metadata: {
    downstream_use_xpost_deny_reason: string;
  };
}

export class GenIGSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get source links from google",
    request: {
      query: z.object({
        query: Str({
          description: "Search query to fetch Instagram links via SerpAPI",
        }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                query: Str(),
                answer: Str(),
                sourceUrls: z.array(Str()),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid searchId parameter",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Document not found",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
    const data = await this.getValidatedData<typeof this.schema>();
    const { query } = data.query;

    // Get client IP from headers or connection, fallback to empty string
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      // @ts-ignore
      c.req.raw?.connection?.remoteAddress ||
      "";
    let countryCode = "in";
    let country = "India";
    try {
      let ipapiUrl = "https://ipapi.co";
      if (clientIp) {
        ipapiUrl += `/${clientIp}/json/`;
      } else {
        ipapiUrl += "/json/";
      }
      const ipRes = await fetch(ipapiUrl);
      const ipJson = (await ipRes.json()) as {
        country_code?: string;
        country_name?: string;
        error?: string;
      };
      countryCode = ipJson.country_code
        ? ipJson.country_code.toLowerCase()
        : "in";
      country = ipJson.country_name ? ipJson.country_name : "India";
    } catch (err) {
      // If ipapi fails, fallback to default countryCode
      countryCode = "in";
      country = "India";
      console.log("ipapi failed, using fallback countryCode:", countryCode);
    }

    const serpUrl = "https://google.serper.dev/videos";
    const altSerpUrl = "https://serpapi.com/search";
    const igSerpUrl = "https://api.hikerapi.com/v2/search/reels";

    try {
      // Fetch both APIs in parallel
      const  [youtubeVideosJson,  altJson, igVideosJson] = await Promise.all([
        fetch(
          `${altSerpUrl}?search_query=${encodeURIComponent(query)}&api_key=${
            process.env.ALT_SERP_API_KEY
          }&engine=youtube`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        ).then((res) => res.json()) as Promise<YouTubeSerpApiResponse>,

        fetch(
          `${altSerpUrl}?q=${encodeURIComponent(query)}&api_key=${
            process.env.ALT_SERP_API_KEY
          }&engine=google_short_videos&gl=${countryCode}&location=${country},`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        ).then((res) => res.json()) as Promise<AltSerpApiResponse>,

        fetch(`${igSerpUrl}?query=${encodeURIComponent(query)}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-access-key": "c9huvin8f1jm0xjk4e6ftg56t78ogc0s",
          },
        }).then((res) => res.json()) as Promise<IGReelsApiResponse>,
      ]);

      //Add Native YouTube Video
      const nativeYoutubeVideoData = (youtubeVideosJson?.video_results || [])
        .map((item: YouTubeVideoResult) => ({
          sourceUrl: item.link,
          thumbnail_url: item.thumbnail,
          video_url: item.thumbnail,
          username: item.channel,
          fullname: "",
          caption: `${item.title} | ${item.description}`,
        }));

      //Add Native YouTube Short Video
      const nativeYoutubeShortVideoData = (youtubeVideosJson?.shorts_results || [])
        .flatMap((group) => group.shorts || [])
        .map((item: YouTubeShort) => ({
          sourceUrl: item.link,
          thumbnail_url: item.thumbnail,
          video_url: item.link,
          username: "",
          fullname: "",
          caption: item.title,
        }));

      // Process Google short videos
      const serpIGVideoLinks = (altJson?.short_video_results || [])
        .filter((item: any) => item.link?.includes("instagram"))
        .map((item: SerpShortVideoItem) => ({
          sourceUrl: item.link,
          thumbnail_url: item.thumbnail,
          video_url: item.clip,
          username: item.channel,
          fullname: "",
          caption: item.title,
        }));
      const serpYTVideoLinks = (altJson?.short_video_results || [])
        .filter((item: any) => item.link?.includes("youtube") || item.link?.includes("youtu.be"))
        .map((item: SerpShortVideoItem) => ({
          sourceUrl: item.link,
          thumbnail_url: item.thumbnail,
          video_url: item.clip,
          username: item.channel,
          fullname: "",
          caption: item.title,
        }));

      // Process Instagram reels
      const nativeIGvVideoLinks = (igVideosJson?.reels_serp_modules || [])
        .flatMap((module) => module.clips || [])
        .map((clip) => {
          const media = clip.media;
          return {
            sourceUrl: `https://instagram.com/reel/${media.id}`,
            thumbnail_url: media.image_versions2?.candidates?.[0]?.url || "",
            video_url: media.video_versions?.[0]?.url || "",
            username: media.user.username,
            fullname: media.user.full_name,
            caption: media.caption?.text || "",
          };
        });

      return {
        query,
        data: {
          "instagram":[...serpIGVideoLinks, ...nativeIGvVideoLinks],
          "youtube":[...serpYTVideoLinks, ...nativeYoutubeVideoData, ...nativeYoutubeShortVideoData]
        },
        //thumbnail_links: thumbnailLinks,
        success: true,
      };
    } catch (error: any) {
      console.error("SerpAPI fetch error:", error);
      return Response.json(
        { error: "Failed to fetch SerpAPI results" },
        { status: 500 }
      );
    }
  }
}
