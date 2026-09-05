import { candidateSchema } from "../types.js";

const attribution =
  "Big Buck Bunny (2008), Blender Foundation / www.bigbuckbunny.org, CC BY 3.0. Vídeo disponibilizado pelo W3C para demonstração do elemento HTML5 video.";

export const openLicensedSources = [
  candidateSchema.parse({
    id: "big-buck-bunny-w3c-full",
    videoId: "tt1254207",
    authorization: attribution,
    url: "https://media.w3.org/2010/05/bunny/movie.mp4",
    audio: [],
    subtitles: [],
    verified: false,
  }),
  candidateSchema.parse({
    id: "big-buck-bunny-w3c-trailer",
    videoId: "tt1254207",
    authorization: attribution,
    url: "https://media.w3.org/2010/05/bunny/trailer.mp4",
    audio: [],
    subtitles: [],
    verified: false,
  }),
];
