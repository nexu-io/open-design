import argparse
import urllib.request
import json
import os
import sys

def download_svg(url, save_path):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            svg_content = response.read().decode('utf-8')
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            
            with open(save_path, 'w', encoding='utf-8') as f:
                f.write(svg_content)
            return True
    except Exception as e:
        print(f"Error downloading {url}: {e}", file=sys.stderr)
        return False

def get_url_by_theme(route_data, theme):
    if isinstance(route_data, str):
        return route_data
    elif isinstance(route_data, dict):
        if theme in route_data:
            return route_data[theme]
        # Fallback to the other theme or first available
        return list(route_data.values())[0] if route_data else None
    return None

def main():
    parser = argparse.ArgumentParser(description="Search and download SVGL brand logos")
    parser.add_argument("--query", required=True, help="Brand name to search for (e.g., 'OpenAI', 'Claude')")
    parser.add_argument("--theme", choices=['light', 'dark'], default='light', help="Theme preference for logos")
    parser.add_argument("--output-dir", required=True, help="Directory to save downloaded SVGs")
    
    args = parser.parse_args()
    
    try:
        req = urllib.request.Request('https://api.svgl.app/', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch SVGL API: {e}", file=sys.stderr)
        sys.exit(1)
        
    matches = []
    query_lower = args.query.lower()
    for item in data:
        if query_lower in item['title'].lower():
            matches.append(item)
            
    if not matches:
        print(json.dumps({"success": False, "error": f"No matches found for '{args.query}'"}))
        sys.exit(0)
        
    # Sort matches by title length to get the most exact match
    # e.g., 'Claude' instead of 'Claude AI' if both exist, though we pick the shortest
    best_match = sorted(matches, key=lambda x: len(x['title']))[0]
    
    title_safe = best_match['title'].replace(' ', '_').lower()
    results = {
        "success": True,
        "title": best_match['title'],
        "url": best_match.get('url', ''),
        "theme_selected": args.theme,
        "logo_path": None,
        "wordmark_path": None
    }
    
    # Download logo
    logo_url = get_url_by_theme(best_match.get('route'), args.theme)
    if logo_url:
        logo_path = os.path.join(args.output_dir, f"{title_safe}_logo.svg")
        if download_svg(logo_url, logo_path):
            results['logo_path'] = logo_path
            
    # Download wordmark if available
    wordmark_url = get_url_by_theme(best_match.get('wordmark'), args.theme)
    if wordmark_url:
        wordmark_path = os.path.join(args.output_dir, f"{title_safe}_wordmark.svg")
        if download_svg(wordmark_url, wordmark_path):
            results['wordmark_path'] = wordmark_path
            
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
