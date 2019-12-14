# Kimppakyyti

## How to use

1. determine the default center of the map
2. set `long`, `lat` and `zoom` as query params e.g: `my-site.com?lat=15.3432&long=12.12421&zoom=9`
3. navigate to deployed site

You can use google maps to find out the coordinates of your location. At the time of writing google maps includes the coordinates of the center of the scrolled position in the map as `https://www.google.com/maps/search/google+maps+get+coordinates/@60.17802,24.9051852,12.9z` where `@60.17802,24.9051852,12.9z` includes the coordinates and zoom as `@<lat>,<long>,<zoom>`.

You can also copy-paste the coordinate part from google's url and set it to query param `g`, e.g: `my-site.com?g=@60.17802,24.9051852,12.9z`.
