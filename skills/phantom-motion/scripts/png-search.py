#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import urllib.parse
import argparse

def get_wikimedia_image(query):
    """Fallback: Gets a high quality image from Wikimedia Commons."""
    search_url = f"https://en.wikipedia.org/w/api.php?action=query&titles={urllib.parse.quote(query)}&prop=pageimages&format=json&pithumbsize=1024"
    try:
        req = urllib.request.Request(search_url, headers={'User-Agent': 'PhantomDeck/1.0'})
        response = urllib.request.urlopen(req)
        data = json.loads(response.read().decode('utf-8'))
        pages = data.get('query', {}).get('pages', {})
        for page_id, page_data in pages.items():
            if 'thumbnail' in page_data:
                return page_data['thumbnail']['source']
    except Exception as e:
        return None
    return None

def get_serpapi_transparent_image(query, api_key):
    """High-end: Gets a true transparent PNG via SerpApi Google Images."""
    search_url = f"https://serpapi.com/search.json?q={urllib.parse.quote(query)}&tbm=isch&tbs=ic:trans&api_key={api_key}"
    try:
        req = urllib.request.Request(search_url, headers={'User-Agent': 'PhantomDeck/1.0'})
        response = urllib.request.urlopen(req)
        data = json.loads(response.read().decode('utf-8'))
        images_results = data.get('images_results', [])
        if images_results:
            return images_results[0]['original']
    except Exception as e:
        return None
    return None

def main():
    parser = argparse.ArgumentParser(description='Search for transparent product/person images.')
    parser.add_argument('--query', required=True, help='Entity name (e.g. "Apple Vision Pro")')
    args = parser.parse_args()

    # Determine track based on env var
    serpapi_key = os.environ.get("SERPAPI_KEY")
    
    result_url = None
    track = "none"

    if serpapi_key:
        result_url = get_serpapi_transparent_image(args.query, serpapi_key)
        track = "serpapi"
    
    if not result_url:
        result_url = get_wikimedia_image(args.query)
        track = "wikimedia_fallback"

    # In a real run, if wikimedia is used, we might rely on CSS mix-blend-mode: multiply in the HTML
    # since wikimedia images usually have white backgrounds instead of pure transparent.

    print(json.dumps({
        "query": args.query,
        "track": track,
        "image_url": result_url
    }, indent=2))

if __name__ == "__main__":
    main()
