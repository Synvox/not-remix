/**
 * @param {any} data
 */
export function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
    },
  });
}

/**
 * @param {string} url
 */
export function redirect(url) {
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
    },
  });
}
