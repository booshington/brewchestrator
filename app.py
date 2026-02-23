from flask import Flask, render_template, request, jsonify, Response, session
import json
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom

app = Flask(__name__)
app.secret_key = os.urandom(24)

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

def calculate_og(grains, batch_size):
    total_points = sum(g['amount'] * g['ppg'] * g['efficiency'] / 100 for g in grains)
    return 1 + (total_points / batch_size / 1000)

def calculate_ibu(hops, batch_size, og):
    total_ibu = 0
    for hop in hops:
        utilization = 1.65 * (0.000125 ** (og - 1)) * ((1 - 2.718 ** (-0.04 * hop['time'])) / 4.15)
        aau = hop['alpha'] * hop['amount']
        total_ibu += (aau * utilization * 7490) / batch_size
    return total_ibu

def calculate_srm(grains, batch_size):
    mcu = sum(g['amount'] * g['lovibond'] for g in grains) / batch_size
    return 1.4922 * (mcu ** 0.6859)

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
    batch_size = data.get('batch_size', 5)
    
    og = calculate_og(data.get('grains', []), batch_size)
    ibu = calculate_ibu(data.get('hops', []), batch_size, og)
    srm = calculate_srm(data.get('grains', []), batch_size)
    
    return jsonify({'og': round(og, 3), 'ibu': round(ibu, 1), 'srm': round(srm, 1)})

@app.route('/api/recipe', methods=['POST'])
def create_recipe():
    if not get_recipe_dir():
        return jsonify({'error': 'No directory set'}), 400
    
    recipe = request.json
    filename = save_recipe(recipe)
    recipe['filename'] = filename
    return jsonify(recipe)

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
    
    recipe = request.json
    recipe['filename'] = filename
    save_recipe(recipe)
    return jsonify(recipe)

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
    
    recipe = {
        'name': rec.findtext('NAME', ''),
        'brewer': rec.findtext('BREWER', ''),
        'batch_size': float(rec.findtext('BATCH_SIZE', '18.927')) / 3.78541,
        'style': rec.findtext('STYLE/NAME', ''),
        'grains': [],
        'hops': [],
        'yeasts': []
    }
    
    for ferm in rec.findall('.//FERMENTABLES/FERMENTABLE'):
        recipe['grains'].append({
            'name': ferm.findtext('NAME', ''),
            'amount': float(ferm.findtext('AMOUNT', '0')) / 0.453592,
            'ppg': int(float(ferm.findtext('YIELD', '80')) / 100 * 46),
            'lovibond': float(ferm.findtext('COLOR', '2')),
            'efficiency': 75
        })
    
    for hop in rec.findall('.//HOPS/HOP'):
        recipe['hops'].append({
            'name': hop.findtext('NAME', ''),
            'amount': float(hop.findtext('AMOUNT', '0')) / 0.0283495,
            'alpha': float(hop.findtext('ALPHA', '5')),
            'time': int(float(hop.findtext('TIME', '60')))
        })
    
    for yeast in rec.findall('.//YEASTS/YEAST'):
        recipe['yeasts'].append({
            'name': yeast.findtext('NAME', ''),
            'type': yeast.findtext('TYPE', 'Ale')
        })
    
    batch_size = recipe['batch_size']
    og = calculate_og(recipe['grains'], batch_size)
    ibu = calculate_ibu(recipe['hops'], batch_size, og)
    srm = calculate_srm(recipe['grains'], batch_size)
    
    recipe.update({'og': round(og, 3), 'ibu': round(ibu, 1), 'srm': round(srm, 1)})
    
    return recipe

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
