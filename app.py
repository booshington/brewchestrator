from flask import Flask, render_template, request, jsonify, Response
import json
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from models import Recipe, Grain, Hop, Yeast

app = Flask(__name__)

INGREDIENTS_FILE = 'ingredients.json'
CONFIG_FILE = 'config.json'

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def get_recipe_dir():
    config = load_config()
    return config.get('recipe_directory', None)

def load_recipes():
    recipe_dir = get_recipe_dir()
    if not recipe_dir or not os.path.exists(recipe_dir):
        return []
    
    recipes = []
    for filename in os.listdir(recipe_dir):
        if filename.endswith('.json'):
            try:
                with open(os.path.join(recipe_dir, filename), 'r') as f:
                    recipe = json.load(f)
                    recipe['filename'] = filename
                    recipes.append(recipe)
            except:
                pass
    return recipes

def save_recipe(recipe):
    recipe_dir = get_recipe_dir()
    if not recipe_dir:
        return False
    
    if not os.path.exists(recipe_dir):
        os.makedirs(recipe_dir)
    
    filename = recipe.get('filename') or f"{recipe['name'].replace(' ', '_')}.json"
    filepath = os.path.join(recipe_dir, filename)
    
    with open(filepath, 'w') as f:
        json.dump(recipe, f, indent=2)
    
    return filename

def load_ingredients():
    if os.path.exists(INGREDIENTS_FILE):
        with open(INGREDIENTS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_ingredients(ingredients):
    with open(INGREDIENTS_FILE, 'w') as f:
        json.dump(ingredients, f, indent=2)



@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/directory', methods=['GET', 'POST'])
def handle_directory():
    if request.method == 'POST':
        data = request.json
        directory = data.get('directory', '')
        
        if directory and os.path.isdir(directory):
            config = load_config()
            config['recipe_directory'] = directory
            save_config(config)
            return jsonify({'success': True, 'directory': directory})
        else:
            return jsonify({'success': False, 'error': 'Invalid directory'}), 400
    else:
        return jsonify({'directory': get_recipe_dir()})

@app.route('/api/recipes')
def get_recipes():
    if not get_recipe_dir():
        return jsonify({'error': 'No directory set'}), 400
    recipes = load_recipes()
    return jsonify(recipes)

@app.route('/api/recipe/<filename>')
def get_recipe(filename):
    recipe_dir = get_recipe_dir()
    if not recipe_dir:
        return jsonify({'error': 'No directory set'}), 400
    
    filepath = os.path.join(recipe_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Recipe not found'}), 404
    
    with open(filepath, 'r') as f:
        recipe = json.load(f)
        recipe['filename'] = filename
        return jsonify(recipe)

@app.route('/api/ingredients/search')
def search_ingredients():
    query = request.args.get('q', '').lower()
    type_filter = request.args.get('type', '')
    ingredients = load_ingredients()
    
    results = [i for i in ingredients if query in i['name'].lower()]
    if type_filter:
        results = [i for i in results if i['type'] == type_filter]
    
    return jsonify(results)

@app.route('/api/ingredients', methods=['POST'])
def add_ingredient():
    ingredients = load_ingredients()
    new_ingredient = request.json
    new_ingredient['id'] = max([i.get('id', 0) for i in ingredients], default=0) + 1
    ingredients.append(new_ingredient)
    save_ingredients(ingredients)
    return jsonify(new_ingredient)

@app.route('/api/recipe/calculate', methods=['POST'])
def calculate_recipe():
    data = request.json
    recipe = Recipe(
        data.get('name', 'temp'),
        data.get('brewer', 'temp'),
        data.get('batch_size', 5)
    )
    
    for g in data.get('grains', []):
        recipe.add_grain(Grain.from_dict(g))
    
    for h in data.get('hops', []):
        recipe.add_hop(Hop.from_dict(h))
    
    return jsonify(recipe.get_stats())

@app.route('/api/recipe', methods=['POST'])
def create_recipe():
    if not get_recipe_dir():
        return jsonify({'error': 'No directory set'}), 400
    
    data = request.json
    recipe = Recipe.from_dict(data)
    recipe_dict = recipe.to_dict()
    
    filename = save_recipe(recipe_dict)
    recipe_dict['filename'] = filename
    return jsonify(recipe_dict)

@app.route('/api/recipe/<filename>', methods=['PUT', 'DELETE'])
def modify_recipe(filename):
    if not get_recipe_dir():
        return jsonify({'error': 'No directory set'}), 400
    
    if request.method == 'DELETE':
        recipe_dir = get_recipe_dir()
        filepath = os.path.join(recipe_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({'success': True})
        return jsonify({'error': 'Recipe not found'}), 404
    
    data = request.json
    recipe = Recipe.from_dict(data)
    recipe_dict = recipe.to_dict()
    recipe_dict['filename'] = filename
    save_recipe(recipe_dict)
    return jsonify(recipe_dict)

@app.route('/api/recipe/<filename>/export')
def export_beerxml(filename):
    recipe_dir = get_recipe_dir()
    if not recipe_dir:
        return jsonify({'error': 'No directory set'}), 400
    
    filepath = os.path.join(recipe_dir, filename)
    if not os.path.exists(filepath):
        return jsonify({'error': 'Recipe not found'}), 404
    
    with open(filepath, 'r') as f:
        recipe = json.load(f)
    
    xml = recipe_to_beerxml(recipe)
    return Response(xml, mimetype='application/xml', headers={'Content-Disposition': f'attachment; filename="{recipe["name"]}.xml"'})

@app.route('/api/recipe/import', methods=['POST'])
def import_beerxml():
    if not get_recipe_dir():
        return jsonify({'error': 'No directory set'}), 400
    
    xml_content = request.data.decode('utf-8')
    recipe = beerxml_to_recipe(xml_content)
    
    filename = save_recipe(recipe)
    recipe['filename'] = filename
    return jsonify(recipe)

def recipe_to_beerxml(recipe):
    root = ET.Element('RECIPES')
    rec = ET.SubElement(root, 'RECIPE')
    
    ET.SubElement(rec, 'NAME').text = recipe.get('name', '')
    ET.SubElement(rec, 'VERSION').text = '1'
    ET.SubElement(rec, 'TYPE').text = 'All Grain'
    ET.SubElement(rec, 'BREWER').text = recipe.get('brewer', '')
    ET.SubElement(rec, 'BATCH_SIZE').text = str(recipe.get('batch_size', 5) * 3.78541)
    ET.SubElement(rec, 'BOIL_SIZE').text = str(recipe.get('batch_size', 5) * 3.78541 * 1.2)
    ET.SubElement(rec, 'BOIL_TIME').text = '60'
    ET.SubElement(rec, 'EFFICIENCY').text = '75'
    
    if recipe.get('style'):
        style = ET.SubElement(rec, 'STYLE')
        ET.SubElement(style, 'NAME').text = recipe['style']
        ET.SubElement(style, 'VERSION').text = '1'
        ET.SubElement(style, 'CATEGORY').text = 'Custom'
        ET.SubElement(style, 'TYPE').text = 'Ale'
    
    hops_elem = ET.SubElement(rec, 'HOPS')
    for hop in recipe.get('hops', []):
        h = ET.SubElement(hops_elem, 'HOP')
        ET.SubElement(h, 'NAME').text = hop['name']
        ET.SubElement(h, 'VERSION').text = '1'
        ET.SubElement(h, 'ALPHA').text = str(hop['alpha'])
        ET.SubElement(h, 'AMOUNT').text = str(hop['amount'] * 0.0283495)
        ET.SubElement(h, 'USE').text = 'Boil'
        ET.SubElement(h, 'TIME').text = str(hop['time'])
    
    ferms = ET.SubElement(rec, 'FERMENTABLES')
    for grain in recipe.get('grains', []):
        f = ET.SubElement(ferms, 'FERMENTABLE')
        ET.SubElement(f, 'NAME').text = grain['name']
        ET.SubElement(f, 'VERSION').text = '1'
        ET.SubElement(f, 'AMOUNT').text = str(grain['amount'] * 0.453592)
        ET.SubElement(f, 'TYPE').text = 'Grain'
        ET.SubElement(f, 'YIELD').text = str((grain['ppg'] / 46) * 100)
        ET.SubElement(f, 'COLOR').text = str(grain['lovibond'])
    
    yeasts_elem = ET.SubElement(rec, 'YEASTS')
    for yeast in recipe.get('yeasts', []):
        y = ET.SubElement(yeasts_elem, 'YEAST')
        ET.SubElement(y, 'NAME').text = yeast['name']
        ET.SubElement(y, 'VERSION').text = '1'
        ET.SubElement(y, 'TYPE').text = yeast.get('type', 'Ale')
        ET.SubElement(y, 'FORM').text = 'Liquid'
    
    rough_string = ET.tostring(root, encoding='unicode')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent='  ')

def beerxml_to_recipe(xml_content):
    root = ET.fromstring(xml_content)
    rec = root.find('RECIPE')
    
    recipe = Recipe(
        rec.findtext('NAME', ''),
        rec.findtext('BREWER', ''),
        float(rec.findtext('BATCH_SIZE', '18.927')) / 3.78541,
        rec.findtext('STYLE/NAME', '')
    )
    
    for ferm in rec.findall('.//FERMENTABLES/FERMENTABLE'):
        grain = Grain(
            ferm.findtext('NAME', ''),
            float(ferm.findtext('AMOUNT', '0')) / 0.453592,
            int(float(ferm.findtext('YIELD', '80')) / 100 * 46),
            float(ferm.findtext('COLOR', '2')),
            75
        )
        recipe.add_grain(grain)
    
    for hop_elem in rec.findall('.//HOPS/HOP'):
        hop = Hop(
            hop_elem.findtext('NAME', ''),
            float(hop_elem.findtext('AMOUNT', '0')) / 0.0283495,
            float(hop_elem.findtext('ALPHA', '5')),
            int(float(hop_elem.findtext('TIME', '60')))
        )
        recipe.add_hop(hop)
    
    for yeast_elem in rec.findall('.//YEASTS/YEAST'):
        yeast = Yeast(
            yeast_elem.findtext('NAME', ''),
            yeast_elem.findtext('TYPE', 'Ale')
        )
        recipe.add_yeast(yeast)
    
    return recipe.to_dict()

@app.route('/api/bjcp/styles')
def get_bjcp_styles():
    styles = [
        {'id': '1A', 'name': 'American Light Lager', 'ibu': [8, 12], 'srm': [2, 3], 'og': [1.028, 1.040], 'fg': [0.998, 1.008]},
        {'id': '5B', 'name': 'Kölsch', 'ibu': [18, 30], 'srm': [3.5, 5], 'og': [1.044, 1.050], 'fg': [1.007, 1.011]},
        {'id': '10A', 'name': 'Weissbier', 'ibu': [8, 15], 'srm': [2, 6], 'og': [1.044, 1.052], 'fg': [1.010, 1.014]},
        {'id': '18B', 'name': 'American Pale Ale', 'ibu': [30, 50], 'srm': [5, 10], 'og': [1.045, 1.060], 'fg': [1.010, 1.015]},
        {'id': '21A', 'name': 'American IPA', 'ibu': [40, 70], 'srm': [6, 14], 'og': [1.056, 1.070], 'fg': [1.008, 1.014]},
        {'id': '13A', 'name': 'Dark Mild', 'ibu': [10, 25], 'srm': [14, 25], 'og': [1.030, 1.038], 'fg': [1.008, 1.013]},
        {'id': '20A', 'name': 'American Porter', 'ibu': [25, 50], 'srm': [22, 40], 'og': [1.050, 1.070], 'fg': [1.012, 1.018]},
        {'id': '20C', 'name': 'Imperial Stout', 'ibu': [50, 90], 'srm': [30, 40], 'og': [1.075, 1.115], 'fg': [1.018, 1.030]}
    ]
    return jsonify(styles)

if __name__ == '__main__':
    app.run(debug=True)
