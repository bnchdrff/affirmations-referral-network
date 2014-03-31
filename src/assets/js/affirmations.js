(function(root, factory) {
  if (typeof exports !== 'undefined') {
    // Node.js or CommonJS
    var _ = require('underscore');
    var Backbone = require('backbone');
    var lunr = require('lunr');
    factory(root, exports, _, Backbone, lunr);
  }
  else {
    // Browser globale
    root.Affirmations = factory(root, root.Affirmations || {}, root._, root.Backbone, root.lunr);
  }
}(this, function(root, Affirmations, _, Backbone) {
  // Models

  var Provider = Affirmations.Provider = Backbone.Model.extend({
    idAttribute: 'id',

    matchesFacets: function(attrs) {
      var attr;
      var val;
      var intersect;
      var thisVal;

      for (attr in attrs) {
        val = attrs[attr];
        thisVal = this.get(attr);

        if (_.isArray(val)) {
          if (!_.isArray(thisVal)) {
            thisVal = [thisVal];
          }
          intersect = _.intersection(val, thisVal);
          if (intersect.length === 0) {
            return false;
          }
        }
        else {
          if (val !== thisVal) {
            return false;
          }
        }
      }

      return true;
    }
  });


  // Collections
  
  var Providers = Affirmations.Providers = Backbone.Collection.extend({
    model: Provider,

    url: '/data/providers.json',

    initialize: function(models, options) {
      this.index = lunr(function() {
        this.field('providername', { boost: 10 });
        this.ref('id');
      });
      this.on('sync', this.updateIndex, this);
      this.on('reset', this.updateIndex, this);
      this.on('sync', this.updateFiltered, this);
      this.on('reset', this.updateFiltered, this);
    },

    updateIndex: function() {
      this.each(function(provider) {
        this.index.add(provider.attributes);
      }, this);
      this.trigger('indexed');
    },

    updateFiltered: function(models) {
      models = models || this.models;
      if (models == this) {
        models = this.models;
      }
      this._filtered = models;
      this._facetOptions = {};
      this.trigger('filter', this._filtered);
    },

    facetOptions: function(attr) {
      this._facetOptions = this._facetOptions || {};

      if (this._facetOptions[attr]) {
        return this._facetOptions[attr];
      }
      else {
        this._facetOptions[attr] = []; 
      }

      var opts = this._facetOptions[attr];
      var seen = {};
      var providers = this._filtered || this.models;
      _.each(providers, function(provider) {
        var val = provider.get(attr);
        var vals;

        if (val === '') {
          return;
        }

        if (_.isArray(val)) {
          vals = val;
        }
        else {
          vals = [val];
        }

        _.each(vals, function(val) {
          if (!seen[val]) {
            seen[val] = true;
            opts.push(val);
          }
        });
      }, this);

      return opts;
    },

    facet: function(attrs) {
      this.updateFiltered(this.filter(function(provider) {
        return provider.matchesFacets(attrs);
      }, this));
      this.trigger('facet', this._filtered);
      return this._filtered;
    },

    resetFilters: function() {
      this.updateFiltered();
    },

    search: function(value) {
      this.updateFiltered(_.map(this.index.search(value), function(match) {
        return this.get(match.ref);
      }, this));
      this.trigger('search', this._filtered);
      return this._filtered; 
    }
  });


  // Views
  

  var FiltersView = Affirmations.FiltersView = Backbone.View.extend({
    tagName: 'form',

    options: {
      filters: [
        {
          attribute: 'type',
          label: "Provider type",
          type: 'select'
        },
        {
          attribute: 'specialties',
          label: "Other specialties and sensitivities",
          type: 'select'
        },
        {
          attribute: 'county',
          label: "County",
          type: 'select'
        },
        {
          attribute: 'orientation',
          label: "Sexual/attractional orientation of provider",
          type: 'select'
        },
        {
          attribute: 'sexgenderidentity',
          label: "Sex/gender identity of provider",
          type: 'select'
        },
        {
          attribute: 'race',
          label: "Race/ethnicity identity of provider",
          type: 'select'
        },
        {
          attribute: 'languages',
          label: "Languages spoken",
          type: 'select'
        },
        {
          attribute: 'nearbus',
          label: "Near a bus line",
          type: 'checkbox'
        },
        {
          attribute: 'completedculturalcompetencytraining',
          label: "Has completed Affirmations' cultural competency training(s) for health providers",
          type: 'checkbox'
        },
        {
          attribute: 'lowincome',
          label: "Offers low-income accomodations",
          type: 'checkbox'
        }
      ]
    },

    attributes: {
      id: 'filters'
    },

    initialize: function(options) {
      this._filters = {};
      this._childViews = [];
      _.each(this.options.filters, function(filterOpts) {
        var view = this._createChildView(filterOpts);
        this.listenTo(view, 'change', this.handleChange, this);
        this._childViews.push(view);
      }, this);

      this.buttonView = new ProviderCountView({
        collection: this.collection
      });
      this.buttonView.on('click', function() {
        this.trigger('showproviders');
      }, this);

      this.collection.on('sync', this.render, this);
    },

    _createChildView: function(options) {
      var opts = {
        filterAttribute: options.attribute,
        label: options.label,
        placeholder: options.placeholder,
        collection: this.collection
      };

      if (options.type === 'checkbox') {
        return new CheckboxFilterView(opts);
      }
      else {
        return new SelectFilterView(opts);
      }
    },

    render: function(options) {
      _.each(this._childViews, function(view) {
        this.$el.append(view.render().$el);
      }, this);
      this.$el.append(this.buttonView.render().$el);
      return this;
    },

    handleChange: function(attr, val) {
      if (!val) {
        delete this._filters[attr];
      }
      else {
        this._filters[attr] = val;
      }
      this.collection.facet(this._filters);
    }
  });

  var FilterView = Backbone.View.extend({
    initialize: function(options) {
      this.filterAttribute = options.filterAttribute;
      this.label = options.label;
      this.postInitialize();
    },

    postInitialize: function() {}
  });
  
  var SelectFilterView = FilterView.extend({
    attributes: {
      class: 'form-group'
    },

    events: {
      'change select': 'change'
    },

    postInitialize: function() {
      this._selected = {};
      this.collection.on('filter', this.renderSelect, this);
    },

    render: function() {
      this.$('option').remove();
      $('<label>').attr('for', this.filterAttribute).html(this.label)
        .appendTo(this.$el);
      $('<select>').attr('id', this.filterAttribute)
        .attr('multiple', 'multiple')
        .addClass('form-control')
        .appendTo(this.$el);
      this.renderSelect();
      return this;
    },

    renderSelect: function() {
      var $select = this.$('select');

      $select.find('option').remove();
      _.each(this.collection.facetOptions(this.filterAttribute), function(opt) {
        var $el = $('<option>').attr('value', opt).html(opt)
          .prop('selected', this._selected[opt] === true)
          .appendTo($select);
      }, this);
      
      return this;
    },

    change: function(evt) {
      var val = this.$('select').val();
      this._selected = {};
      if (_.isArray(val)) {
        _.each(val, function(selected) {
          this._selected[selected] = true;
        }, this);
      }
      this.trigger('change', this.filterAttribute, val);
    }
  });

  var CheckboxFilterView = FilterView.extend({
    attributes: {
      class: 'checkbox'
    },

    events: {
      'change input': 'change'
    },

    render: function() {
      var $label = $('<label>');
      $label.html(this.label);
      $('<input type="checkbox">').attr('value', this.filterAttribute)
        .attr('id', this.filterAttribute)
        .prependTo($label);
      this.$el.append($label);
      return this;
    },

    change: function(evt) {
      var val = this.$('input').prop('checked');
      this.trigger('change', this.filterAttribute, val); 
    }
  });

  var ProviderListView = Affirmations.ProviderListView = Backbone.View.extend({
    initialize: function(options) {
      this.collection.on('filter', this.handleFilter, this);
    },

    handleFilter: function(providers) {
      var map = {};
      _.each(providers, function(provider) {
        map[provider.id] = true;
      });
      this.$providers().each(function() {
        var $el = $(this);
        var id = $el.data('id');
        $el.toggle(map[id] || false);
      });
    },

    $providers: function() {
      return this.$('.provider');
    },

    /**
     * Show the summary display of the provider entries rather than the full view.
     */
    summarize: function() {
      this.$el.addClass('summary'); 
      return this;
    }
  });

  var ProviderCountView = Affirmations.ProviderCountView = Backbone.View.extend({
    tagName: 'button',

    attributes: {
      class: 'btn btn-primary',
      id: 'count'
    },

    events: {
      'click': 'click'
    },

    initialize: function(options) {
      this.collection.on('filter', this.updateFilteredLength, this);
      this.collection.once('sync', this.updateLength, this);
      this.length = this.collection.length;
    },

    render: function() {
      var label = this.length === 1 ? 'Provider' : 'Providers';
      this.$el.html('View ' + this.length + ' ' + label + ' &#0187;');
      return this;
    },

    updateFilteredLength: function(providers) {
      this.length = providers.length;
      this.render();
    },

    updateLength: function() {
      this.length = this.collection.length;
      this.render();
    },

    click: function(evt) {
      evt.preventDefault();
      this.trigger('click');
    }
  });

  var SearchView = Affirmations.SearchView = Backbone.View.extend({
    options: {
      minLength: 3,
      placeholder: "Search by name"
    },

    tagName: 'form',

    attributes: {
      class: 'navbar-form navbar-left'
    },

    events: {
      'submit': 'submit'
    },

    render: function() {
      var $container = $('<div>').addClass('form-group');
      $('<input>').attr('type', 'search').addClass('form-control')
        .attr('id', 'search')
        .attr('placeholder',  this.options.placeholder)
        .appendTo($container);
      this.$el.append($container);
      this.delegateEvents();
      return this;
    },

    submit: function(evt) {
      evt.preventDefault();
      var val = this.$('input').val();
      if (val === '') {
        this.collection.resetFilters();
      }
      else if (val.length >= this.options.minLength) {
        this.collection.search(val);
      }
      this.trigger('search');
    }
  });

  var Router = Affirmations.Router = Backbone.Router.extend({
    routes: {
      '': 'index',
      'providers': 'providers'
    }
  });

  return Affirmations;
}));
