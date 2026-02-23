class Grain:
    def __init__(self, name, amount, ppg, lovibond, efficiency=75):
        self.name = name
        self.amount = amount
        self.ppg = ppg
        self.lovibond = lovibond
        self.efficiency = efficiency
    
    def gravity_points(self, batch_size):
        return self.amount * self.ppg * self.efficiency / 100 / batch_size
    
    def color_contribution(self, batch_size):
        return self.amount * self.lovibond / batch_size
    
    def to_dict(self):
        return {
            'name': self.name,
            'amount': self.amount,
            'ppg': self.ppg,
            'lovibond': self.lovibond,
            'efficiency': self.efficiency
        }
    
    @staticmethod
    def from_dict(data):
        return Grain(
            data['name'],
            data['amount'],
            data['ppg'],
            data['lovibond'],
            data.get('efficiency', 75)
        )

class Hop:
    def __init__(self, name, amount, alpha, time):
        self.name = name
        self.amount = amount
        self.alpha = alpha
        self.time = time
    
    def ibu_contribution(self, batch_size, og):
        utilization = 1.65 * (0.000125 ** (og - 1)) * ((1 - 2.718 ** (-0.04 * self.time)) / 4.15)
        aau = self.alpha * self.amount
        return (aau * utilization * 7490) / batch_size
    
    def to_dict(self):
        return {
            'name': self.name,
            'amount': self.amount,
            'alpha': self.alpha,
            'time': self.time
        }
    
    @staticmethod
    def from_dict(data):
        return Hop(
            data['name'],
            data['amount'],
            data['alpha'],
            data['time']
        )

class Yeast:
    def __init__(self, name, yeast_type='Ale'):
        self.name = name
        self.type = yeast_type
    
    def to_dict(self):
        return {
            'name': self.name,
            'type': self.type
        }
    
    @staticmethod
    def from_dict(data):
        return Yeast(
            data['name'],
            data.get('type', 'Ale')
        )

class Recipe:
    def __init__(self, name, brewer, batch_size, style='', tags=''):
        self.name = name
        self.brewer = brewer
        self.batch_size = batch_size
        self.style = style
        self.tags = tags
        self.grains = []
        self.hops = []
        self.yeasts = []
    
    def add_grain(self, grain):
        self.grains.append(grain)
    
    def add_hop(self, hop):
        self.hops.append(hop)
    
    def add_yeast(self, yeast):
        self.yeasts.append(yeast)
    
    def calculate_og(self):
        total_points = sum(g.gravity_points(self.batch_size) for g in self.grains)
        return 1 + (total_points / 1000)
    
    def calculate_ibu(self):
        og = self.calculate_og()
        return sum(h.ibu_contribution(self.batch_size, og) for h in self.hops)
    
    def calculate_srm(self):
        mcu = sum(g.color_contribution(self.batch_size) for g in self.grains)
        return 1.4922 * (mcu ** 0.6859) if mcu > 0 else 0
    
    def get_stats(self):
        return {
            'og': round(self.calculate_og(), 3),
            'ibu': round(self.calculate_ibu(), 1),
            'srm': round(self.calculate_srm(), 1)
        }
    
    def to_dict(self):
        return {
            'name': self.name,
            'brewer': self.brewer,
            'batch_size': self.batch_size,
            'style': self.style,
            'tags': self.tags,
            'grains': [g.to_dict() for g in self.grains],
            'hops': [h.to_dict() for h in self.hops],
            'yeasts': [y.to_dict() for y in self.yeasts],
            **self.get_stats()
        }
    
    @staticmethod
    def from_dict(data):
        recipe = Recipe(
            data['name'],
            data['brewer'],
            data['batch_size'],
            data.get('style', ''),
            data.get('tags', '')
        )
        recipe.grains = [Grain.from_dict(g) for g in data.get('grains', [])]
        recipe.hops = [Hop.from_dict(h) for h in data.get('hops', [])]
        recipe.yeasts = [Yeast.from_dict(y) for y in data.get('yeasts', [])]
        return recipe
