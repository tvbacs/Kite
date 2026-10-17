import { SearchEngine } from '../types/browser';

export const SEARCH_ENGINES: Record<string, SearchEngine> = {
  google: {
    id: 'google',
    name: 'Google',
    searchUrl: 'https://www.google.com/search?q=',
    logoUrl: 'https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_160x56dp.png',
    logoWidth: 160,
    logoHeight: 56,
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    searchUrl: 'https://duckduckgo.com/?q=',
    logoUrl: 'https://duckduckgo.com/assets/icons/meta/DDG-icon_256x256.png',
    logoWidth: 70,
    logoHeight: 70,
  },
  bing: {
    id: 'bing',
    name: 'Bing',
    searchUrl: 'https://www.bing.com/search?q=',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Bing_logo_%282016%29.svg/320px-Bing_logo_%282016%29.svg.png',
    logoWidth: 120,
    logoHeight: 46,
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo',
    searchUrl: 'https://search.yahoo.com/search?p=',
    logoUrl: 'https://s.yimg.com/rz/p/yahoo_frontpage_en-US_s_f_p_205x58_frontpage_2x.png',
    logoWidth: 130,
    logoHeight: 40,
  },
};
