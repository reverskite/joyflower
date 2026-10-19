export const GA_MEASUREMENT_ID = 'G-WYCG3RQ0W2';
export const GA_SITE_ORIGIN = 'https://thejoyflower.co.kr';
const SCRIPT_ID = 'joyflower-ga4';
const DISABLE_KEY = `ga-disable-${GA_MEASUREMENT_ID}` as const;

type Gtag = (...args: unknown[]) => void;
type AnalyticsState = { lastPath: string | null; referrer: string };
type AnalyticsWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: Gtag;
  __joyflowerGA4?: AnalyticsState;
  [DISABLE_KEY]?: boolean;
};

const publicPages: Record<string, string> = {
  '/': '조이플라워',
  '/christmas': '크리스마스트리 대여 | 조이플라워',
  '/planterior': '조화 플랜테리어 | 조이플라워',
  '/landscape': '조경관리 | 조이플라워',
  '/portfolio': '포트폴리오 | 조이플라워',
  '/inquiry': '견적문의 | 조이플라워',
  '/privacy': '개인정보 처리방침 | 조이플라워',
};

function safeReferrer(value: string): string {
  try { return new URL(value).origin; } catch { return ''; }
}

// GA4 stream Enhanced Measurement must be OFF: send_page_view:false alone
// does not disable its independent history-based page views or form tracking.
export function trackPublicPage(
  pathname: string,
  portfolioPaths: readonly string[],
  host: AnalyticsWindow = window as AnalyticsWindow,
): 'sent' | 'duplicate' | 'excluded' | 'existing-tag' {
  if (host.location.origin !== GA_SITE_ORIGIN) return 'excluded';
  const title = publicPages[pathname] ??
    (portfolioPaths.includes(pathname) ? '시공 사례 | 조이플라워' : undefined);
  if (!title) {
    host[DISABLE_KEY] = true;
    if (host.__joyflowerGA4) {
      host.__joyflowerGA4.lastPath = null;
      host.__joyflowerGA4.referrer = '';
    }
    return 'excluded';
  }

  const location = GA_SITE_ORIGIN + pathname;
  if (!host.__joyflowerGA4) {
    // Fail closed if another integration is introduced later.
    if (host.gtag || host.document.querySelector(
      'script[src*="googletagmanager.com/"],script[src*="google-analytics.com/"],#' + SCRIPT_ID,
    )) return 'existing-tag';
    host.dataLayer ??= [];
    // Google's documented queue format uses the arguments object.
    // eslint-disable-next-line prefer-rest-params
    const gtag: Gtag = function () { host.dataLayer!.push(arguments); };
    host.gtag = gtag;
    host.__joyflowerGA4 = { lastPath: null, referrer: safeReferrer(host.document.referrer) };
    host[DISABLE_KEY] = false;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      page_location: location,
      page_title: title,
      page_referrer: host.__joyflowerGA4.referrer,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = host.document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    host.document.head.appendChild(script);
  }

  const state = host.__joyflowerGA4;
  if (state.lastPath === pathname) return 'duplicate';
  host[DISABLE_KEY] = false;
  const page = { page_location: location, page_title: title, page_referrer: state.referrer };
  host.gtag!('set', page);
  host.gtag!('event', 'page_view', { ...page, send_to: GA_MEASUREMENT_ID });
  state.lastPath = pathname;
  state.referrer = location;
  return 'sent';
}
