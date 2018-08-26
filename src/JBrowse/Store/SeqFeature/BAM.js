define( [
            'dojo/_base/declare',
            'dojo/_base/array',
            'dojo/_base/Deferred',
            'dojo/_base/lang',
            'JBrowse/has',
            'JBrowse/Util',
            'JBrowse/Store/SeqFeature',
            'JBrowse/Store/DeferredStatsMixin',
            'JBrowse/Store/DeferredFeaturesMixin',
            'JBrowse/Model/XHRBlob',
            'JBrowse/Store/SeqFeature/IndexedStatsEstimationMixin',
            './BAM/File'
        ],
        function(
            declare,
            array,
            Deferred,
            lang,
            has,
            Util,
            SeqFeatureStore,
            DeferredStatsMixin,
            DeferredFeaturesMixin,
            XHRBlob,
            IndexedStatsEstimationMixin,
            BAMFile
        ) {

var BAMStore = declare( [ SeqFeatureStore, DeferredStatsMixin, DeferredFeaturesMixin, IndexedStatsEstimationMixin ],

/**
 * @lends JBrowse.Store.SeqFeature.BAM
 */
{
    /**
     * Data backend for reading feature data directly from a
     * web-accessible BAM file.
     *
     * @constructs
     */
    constructor: function( args ) {
        var bamBlob = args.bam ||
            new XHRBlob( this.resolveUrl(
                             args.urlTemplate || 'data.bam'
                         ),
                         { expectRanges: true }
                       );

        var csiBlob, baiBlob;
        var browser = args.browser;

        if(args.csi || this.config.csiUrlTemplate) {
            csiBlob = args.csi ||
                new XHRBlob(
                    this.resolveUrl(
                        this.getConf('csiUrlTemplate',[])
                    )
                );
        } else {
            baiBlob = args.bai ||
                new XHRBlob( this.resolveUrl(
                    args.baiUrlTemplate || ( args.urlTemplate ? args.urlTemplate+'.bai' : 'data.bam.bai' )
                )
            );
        }


        this.bam = new BAMFile({
            store: this,
            data: bamBlob,
            bai: baiBlob,
            browser: browser,
            csi: csiBlob,
            chunkSizeLimit: args.chunkSizeLimit
        });

        this.source = ( bamBlob.url  ? bamBlob.url.match( /\/([^/\#\?]+)($|[\#\?])/ )[1] :
                        bamBlob.blob ? bamBlob.blob.name : undefined ) || undefined;

        if( ! has( 'typed-arrays' ) ) {
            this._failAllDeferred( 'This web browser lacks support for JavaScript typed arrays.' );
            return;
        }

        this.bam.init({
            success: lang.hitch( this,
                                 function() {
                                     this._deferred.features.resolve({success:true});

                                     this._estimateGlobalStats()
                                         .then( lang.hitch(
                                                    this,
                                                    function( stats ) {
                                                        this.globalStats = stats;
                                                        this._deferred.stats.resolve({success:true});
                                                    }
                                                ),
                                                lang.hitch( this, '_failAllDeferred' )
                                              );
                                 }),
            failure: lang.hitch( this, '_failAllDeferred' )
        });

        this.storeTimeout = args.storeTimeout || 3000;
    },

    /**
     * Interrogate whether a store has data for a given reference
     * sequence.  Calls the given callback with either true or false.
     *
     * Implemented as a binary interrogation because some stores are
     * smart enough to regularize reference sequence names, while
     * others are not.
     */
    hasRefSeq: function( seqName, callback, errorCallback ) {
        var thisB = this;
        seqName = thisB.browser.regularizeReferenceName( seqName );
        this._deferred.stats.then( function() {
            callback( seqName in thisB.bam.chrToIndex );
        }, errorCallback );
    },

    // called by getFeatures from the DeferredFeaturesMixin
    _getFeatures: function( query, featCallback, endCallback, errorCallback ) {
        const features = [];
        const fun = (feat) => {
            features.push(feat);
        }
        const end = () => {
            features.sort((a, b) => {
                const x = a.get('cigar').indexOf("N")==-1;
                const y = b.get('cigar').indexOf("N")==-1;
                if(x && y) return 0;
                if(x && !y) return 1;
                if(!x && y) return -1;
                else return 0;
            })
            features.forEach(featCallback);
            endCallback();
        }
        this.bam.fetch( query.ref ? query.ref : this.refSeq.name, query.start, query.end, fun, end, errorCallback );
    },

    saveStore: function() {
        return {
            urlTemplate: this.config.bam.url,
            csiUrlTemplate: (this.config.csi||{}).url,
            baiUrlTemplate: (this.config.bai||{}).url
        };
    }

});

return BAMStore;
});
