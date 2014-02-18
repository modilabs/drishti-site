angular.module('drishtiSiteApp')
    .service('RegisterService', function ($http, $q, $moment, DRISHTI_WEB_BASE_URL, JSON_TO_XLS_BASE_URL, REGISTER_TOKENS) {
        'use strict';

        var getFPUsers = function (allECs) {
            var fpUsers = {
                iudUsers: [],
                condomUsers: [],
                ocpUsers: [],
                maleSterilizationUsers: [],
                femaleSterilizationUsers: []
            };
            allECs.forEach(function (ec) {
                ec.wifeAge =
                    Math.floor((new Date() - new Date(Date.parse(ec.wifeDOB))) / 1000 / 60 / 60 / 24 / 365);
                ec.husbandAge =
                    Math.floor((new Date() - new Date(Date.parse(ec.husbandDOB))) / 1000 / 60 / 60 / 24 / 365);
                if (ec.fpDetails.method === 'iud') {
                    fpUsers.iudUsers.push(ec);
                } else if (ec.fpDetails.method === 'condom') {
                    fpUsers.condomUsers.push(ec);
                } else if (ec.fpDetails.method === 'ocp') {
                    fpUsers.ocpUsers.push(ec);
                } else if (ec.fpDetails.method === 'male_sterilization') {
                    fpUsers.maleSterilizationUsers.push(ec);
                } else if (ec.fpDetails.method === 'female_sterilization') {
                    fpUsers.femaleSterilizationUsers.push(ec);
                }
            });
            return fpUsers;
        };

        var caste = function (symbol) {
            /*jshint camelcase: false*/
            var castes = {
                sc: 'SC',
                st: 'ST',
                c_others: 'Others'
            };
            /*jshint camelcase: true*/
            return castes[symbol] || symbol;
        };

        var prepareRegisterForEC = function (anm) {
            var getRegisterUrl = DRISHTI_WEB_BASE_URL + '/registers/ec?anm-id=' + anm.identifier;
            return $http({method: 'GET', url: getRegisterUrl})
                .then(function (result) {
                    return result.data;
                }, function () {
                    console.log('Error when getting EC register for anm:' + anm.identifier);
                    return $q.reject('Error when getting EC register for anm:' + anm.identifier);
                })
                .then(function (register) {
                    updateRegisterWithDate(register);
                    updateRegisterWithLocation(register, anm);
                    register.ecRegisterEntries.forEach(function (entry) {
                        entry.village = humanizeAndTitleize(entry.village);
                        entry.householdDetails = entry.householdNumber +
                            (entry.householdAddress ? ', ' + entry.householdAddress : '') +
                            (entry.headOfHousehold ? ', ' + entry.headOfHousehold : '');
                        entry.economicStatus = (entry.economicStatus || '').toUpperCase();
                        entry.educationLevel = (entry.wifeEducationLevel ? entry.wifeEducationLevel : '') +
                            (entry.husbandEducationLevel ? ' / ' + entry.husbandEducationLevel : '');
                        entry.ageDetails = entry.wifeAge + (entry.husbandAge ? ' / ' + entry.husbandAge : '');
                        entry.caste = caste(entry.caste);
                        entry.currentFPMethod = fpMethods(entry.currentFPMethod);
                        entry.isPregnant = humanizeAndTitleize(entry.isPregnant);
                    });
                    var xRequestedWith = $http.defaults.headers.common['X-Requested-With'];
                    var authorization = $http.defaults.headers.common.Authorization;
                    delete $http.defaults.headers.common['X-Requested-With'];
                    delete $http.defaults.headers.common.Authorization;
                    return $http({method: 'POST', url: JSON_TO_XLS_BASE_URL + '/xls/' + REGISTER_TOKENS.ec, data: register})
                        .then(function (result) {
                            return JSON_TO_XLS_BASE_URL + result.data;
                        }, function () {
                            console.log('Error when getting register from json-to-xls service.');
                            return $q.reject('Error when getting register from json-to-xls service.');
                        })
                        .finally(function () {
                            $http.defaults.headers.common['X-Requested-With'] = xRequestedWith;
                            $http.defaults.headers.common.Authorization = authorization;
                        });
                }
            );
        };

        var updateRegisterWithDate = function (register) {
            register.generatedDate = $moment().format('YYYY-MM-DD');
        };

        var humanizeAndTitleize = function (input) {
            try {
                var str = input.split('_').join(' ');
                return str.replace(/\w\S*/g, function (txt) {
                    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
                });
            }
            catch (err) {
                console.log('Error while humanising the string: ' + err);
                return input;
            }
        };

        var prepareRegisterForANC = function (anm) {
            var getRegisterUrl = DRISHTI_WEB_BASE_URL + '/registers/anc?anm-id=' + anm.identifier;
            return $http({method: 'GET', url: getRegisterUrl})
                .then(function (result) {
                    return result.data;
                }, function (err) {
                    console.log('Error when getting ANC register for anm:' + anm.identifier + ', error: ' + err);
                    return $q.reject('Error when getting ANC register for anm:' + anm.identifier + ', error: ' + err);
                })
                .then(function (register) {
                    updateRegisterWithDate(register);
                    updateRegisterWithLocation(register, anm);
                    register.ancRegisterEntries.forEach(function (entry) {
                        entry.wifeAge = calculateWifeAge(entry.wifeDOB);
                        entry.addressDetails = entry.wifeName +
                            (entry.husbandName ? ', W/O ' + entry.husbandName : '') +
                            (entry.address ? ', C/O ' + entry.address : '');
                        entry.casteReligionDetails = entry.caste ? caste(entry.caste) : '';
                        entry.casteReligionDetails = (entry.casteReligionDetails === '' ? '' : entry.casteReligionDetails) +
                            (entry.religion ? '/' + entry.religion : '');
                        entry.economicStatus = (entry.economicStatus ? entry.economicStatus.toUpperCase() : '') + (entry.bplCardNumber ? '(' + entry.bplCardNumber + ')' : '');
                        if (entry.youngestChildDOB) {
                            entry.youngestChildAge = calculateChildAge(entry.youngestChildDOB);
                        }
                        entry.lmpEDDDetails = $moment(entry.lmp).format('YYYY-MM-DD') + ' ' + $moment(entry.edd).format('YYYY-MM-DD');
                        updateBPValues(entry.ancVisits);
                        updateRTISTIValues(entry.ancVisits);
                        fillMissingValues(entry);
                    });
                    return $http({method: 'POST', url: JSON_TO_XLS_BASE_URL + '/xls/' + REGISTER_TOKENS.anc, data: register})
                        .then(function (result) {
                            return JSON_TO_XLS_BASE_URL + result.data;
                        }, function () {
                            console.log('Error when getting register from json-to-xls service.');
                            return $q.reject('Error when getting register from json-to-xls service.');
                        });
                }
            );
        };

        var calculateWifeAge = function (dateOfBirth) {
            return $moment().diff($moment(dateOfBirth), 'years');
        };
        var calculateChildAge = function (dateOfBirth) {
            var personDOB = [dateOfBirth[0], dateOfBirth[1] - 1, dateOfBirth[2]];
            var today = $moment();
            var days = today.diff($moment(personDOB), 'days');
            if (days <= 28) {
                return days + ' d.';
            }
            var weeks = today.diff($moment(personDOB), 'weeks');
            if (weeks <= 14) {
                return weeks + ' w.';
            }
            var months = today.diff($moment(personDOB), 'months');
            if (months < 24) {
                return months + ' m.';
            }
            var years = today.diff($moment(personDOB), 'years');
            var remainingMonths = months - (years * 12);
            if (remainingMonths !== 0) {
                return years + ' y. ' + remainingMonths + ' m.';
            }
            return years + ' y.';
        };

        var fillMissingValues = function (entry) {
            var services = ['ttDoses', 'ifaTablets', 'ancVisits', 'remarks', 'contentHolder'];
            var servicesLength = [];
            services.forEach(function (service) {
                entry[service] = entry[service] || [];
                servicesLength.push(entry[service].length);
            });
            entry.maxLength = _.max(servicesLength);
            services.forEach(function (service) {
                fillValuesToMatchLength(entry, service);
            });
            return entry;
        };

        var fillValuesToMatchLength = function (entry, service) {
            entry[service] = entry[service].concat(_(entry.maxLength - entry[service].length).times(function () {
                return {};
            }));
        };

        var updateRTISTIValues = function (ancVisits) {
            ancVisits.forEach(function (visit) {
                visit.rtiSTIValue = (visit.rti ? visit.rti : '') + (visit.sti ? '/' + visit.sti : '');
            });
        };

        var updateBPValues = function (ancVisits) {
            ancVisits.forEach(function (visit) {
                visit.bp = (visit.bpSystolic || '') + (visit.bpDiastolic ? '/' + visit.bpDiastolic : '');
            });
        };

        var updateRegisterWithLocation = function (register, anm) {
            register.anmDetails = {
                location: anm.location,
                name: anm.name
            };
        };

        var fpMethods = function (symbol) {
            /*jshint camelcase: false*/
            var methods = {
                ocp: 'OCP',
                iud: 'IUD',
                condom: 'Condom',
                female_sterilization: 'Female Sterilization',
                male_sterilization: 'Male Sterilization',
                none: 'None',
                traditional_methods: 'Traditional Methods',
                dmpa_injectable: 'DMPA Injectable',
                lam: 'LAM'
            };
            /*jshint camelcase: true*/

            return methods[symbol] || symbol;
        };

        return {
            fpUsers: function (allECs) {
                return getFPUsers(allECs);
            },
            prepareRegisterForEC: function (anm) {
                return prepareRegisterForEC(anm);
            },
            prepareRegisterForANC: function (anm) {
                return prepareRegisterForANC(anm);
            },
            fillMissingValues: function (register) {
                return fillMissingValues(register);
            },
            calculateChildAge: function (dateOfBirth) {
                return calculateChildAge(dateOfBirth);
            },
            calculateWifeAge: function (dateOfBirth) {
                return calculateWifeAge(dateOfBirth);
            }
        };
    });