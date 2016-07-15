/**
 * Copyright (c) 2014, Raghu Nayyar <beingminimal@gmail.com>
 * Copyright (c) 2014, Arthur Schiwon <blizzz@owncloud.com>
 * This file is licensed under the Affero General Public License version 3 or later.
 * See the COPYING-README file.
 */

/* global UserList */
var $userGroupList,
	$sortGroupBy;

var GroupList;
GroupList = {
	activeGID: '',
	everyoneGID: '_everyone',
	filter: '',
	filterGroups: false,

	_GROUP_TEMPLATE:
		'<li class="isgroup">' +
		'<a href="#" class="dorename">' +
		'	<span class="groupname">{{name}}</span>' +
		'</a>' +
		'<span class="utils">' +
		'	<span class="usercount">{{#if hasUserCount}}{{userCount}}{{/if}}</span>' +
		'	{{#if canDelete}}' +
		'	<a href="#" class="action delete" original-title="{{deleteLabel}}">' +
		'		<img src="{{deleteIconUrl}}" class="svg" />' +
		'	</a>' +
		'	{{/if}}' +
		'	</span>' +
		'</li>',

	groupTemplate: function(data) {
		if (!this._groupTemplate) {
			this._groupTemplate = Handlebars.compile(this._GROUP_TEMPLATE);
		}
		return this._groupTemplate(data);
	},

	/**
	 * Add group
	 *
	 * @param {string} gid group id
	 * @param {int} usercount user count in the group
	 * @param {bool} [isAdminGroup=false] whether the added group is the admin group
	 * @param {bool} [sort=false} whether to insert sort the value
	 */
	addGroup: function (gid, userCount, isAdminGroup, doSort) {
		var $li = $(this.groupTemplate({
			name: isAdminGroup ? t('settings', 'Admins') : gid,
			userCount: userCount,
			hasUserCount: userCount > 0,
			canDelete: !isAdminGroup,
			deleteLabel: t('settings', 'Delete'),
			deleteIconUrl: OC.imagePath('core', 'actions/delete')
		}));
		$li.data('gid', gid);
		$li.appendTo($userGroupList);

		if (doSort) {
			// TODO: find insertion point instead of doing a full sort
			GroupList.sortGroups();
		}

		return $li;
	},

	setUserCount: function (groupLiElement, usercount) {
		if ($sortGroupBy !== 1) {
			// If we don't sort by group count we don't display them either
			return;
		}

		var $groupLiElement = $(groupLiElement);
		if (usercount === undefined || usercount === 0 || usercount < 0) {
			usercount = '';
			$groupLiElement.data('usercount', 0);
		} else {
			$groupLiElement.data('usercount', usercount);
		}
		$groupLiElement.find('.usercount').text(usercount);
	},

	getUserCount: function ($groupLiElement) {
		return parseInt($groupLiElement.data('usercount'), 10);
	},

	modGroupCount: function(gid, diff) {
		var $li = GroupList.getGroupLI(gid);
		var count = GroupList.getUserCount($li) + diff;
		GroupList.setUserCount($li, count);
	},

	incEveryoneCount: function() {
		GroupList.modGroupCount(GroupList.everyoneGID, 1);
	},

	decEveryoneCount: function() {
		GroupList.modGroupCount(GroupList.everyoneGID, -1);
	},

	incGroupCount: function(gid) {
		GroupList.modGroupCount(gid, 1);
	},

	decGroupCount: function(gid) {
		GroupList.modGroupCount(gid, -1);
	},

	getCurrentGID: function () {
		return GroupList.activeGID;
	},

	sortGroups: function () {
		var lis = $userGroupList.find('.isgroup').get();

		lis.sort(function (a, b) {
			// "Everyone" always at the top
			if ($(a).data('gid') === '_everyone') {
				return -1;
			} else if ($(b).data('gid') === '_everyone') {
				return 1;
			}

			// "admin" always as second
			if ($(a).data('gid') === 'admin') {
				return -1;
			} else if ($(b).data('gid') === 'admin') {
				return 1;
			}

			if ($sortGroupBy === 1) {
				// Sort by user count first
				var $usersGroupA = $(a).data('usercount'),
					$usersGroupB = $(b).data('usercount');
				if ($usersGroupA > 0 && $usersGroupA > $usersGroupB) {
					return -1;
				}
				if ($usersGroupB > 0 && $usersGroupB > $usersGroupA) {
					return 1;
				}
			}

			// Fallback or sort by group name
			return UserList.alphanum(
				$(a).find('a span').text(),
				$(b).find('a span').text()
			);
		});

		var items = [];
		$.each(lis, function (index, li) {
			items.push(li);
			if (items.length === 100) {
				$userGroupList.append(items);
				items = [];
			}
		});
		if (items.length > 0) {
			$userGroupList.append(items);
		}
	},

	createGroup: function (groupname) {
		$.post(
			OC.generateUrl('/settings/users/groups'),
			{
				id: groupname
			},
			function (result) {
				if (result.groupname) {
					var addedGroup = result.groupname;
					UserList.availableGroups = $.unique($.merge(UserList.availableGroups, [addedGroup]));
					GroupList.addGroup(result.groupname, 0, false, true);

					$('.groupsselect, .subadminsselect')
						.append($('<option>', { value: result.groupname })
							.text(result.groupname));
				} else {
					if (result.data.groupname) {
						var addedGroup = result.data.groupname;
						UserList.availableGroups = $.unique($.merge(UserList.availableGroups || [], [addedGroup]));
						GroupList.addGroup(result.data.groupname, 0, false, true);

						$('.groupsselect, .subadminsselect')
							.append($('<option>', { value: result.data.groupname })
								.text(result.data.groupname));
					}
					GroupList.toggleAddGroup();
				}
			}
		).fail(function(result, textStatus, errorThrown) {
			OC.Notification.showTemporary(t('settings', 'Error creating group: {message}', {message: result.responseJSON.message}));
		});
	},

	/**
	 * Clear group list
	 */
	clear: function() {
		$userGroupList.find('li.isgroup').remove();
	},

	/**
	 * Update group list
	 */
	update: function () {
		if (GroupList.updating) {
			return;
		}
		GroupList.updating = true;

		$userGroupList.addClass('hidden');
		this.clear();
		$userGroupList.before('<div class="loading" style="height:50px; margin-top: 20px"></div>');

		$.get(
			OC.generateUrl('/settings/users/groups'),
			{
				pattern: this.filter,
				filterGroups: this.filterGroups ? 1 : 0,
				sortGroups: $sortGroupBy
			},
			function (result) {
				$userGroupList.removeClass('hidden');
				$userGroupList.parent().find('.loading').remove();

				var lis = [];
				$.each(result.data, function (subsetName, subset) {
					var isAdmin = (subsetName === 'adminGroups');
					$.each(subset, function (index, group) {
						if (GroupList.getGroupLI(group.name).length > 0) {
							GroupList.setUserCount(GroupList.getGroupLI(group.name).first(), group.usercount);
						}
						else {
							var $li = GroupList.addGroup(group.name, group.usercount, isAdmin, false);

							$li.addClass('appear transparent');
							lis.push($li);
						}
					});
				});
				if (!result.groups || !result.groups.length) {
					GroupList.noMoreEntries = true;
				}
				_.defer(function () {
					$(lis).each(function () {
						this.removeClass('transparent');
					});
				});
				GroupList.updating = false;

			}
		).fail(function(result) {
			OC.dialogs.alert(result.responseJSON.message, t('settings', 'Error retrieving groups'));
		});
	},

	elementBelongsToAddGroup: function (el) {
		return !(el !== $('#newgroup-form').get(0) &&
		$('#newgroup-form').find($(el)).length === 0);
	},

	hasAddGroupNameText: function () {
		var name = $('#newgroupname').val();
		return $.trim(name) !== '';

	},

	showGroup: function (gid) {
		GroupList.activeGID = gid;
		UserList.empty();
		UserList.update(gid);
		$userGroupList.find('li').removeClass('active');
		if (gid !== undefined) {
			//TODO: treat Everyone properly
			GroupList.getGroupLI(gid).addClass('active');
		}
	},

	isAddGroupButtonVisible: function () {
		return $('#newgroup-init').is(":visible");
	},

	toggleAddGroup: function (event) {
		if (GroupList.isAddGroupButtonVisible()) {
			event.stopPropagation();
			$('#newgroup-form').show();
			$('#newgroup-init').hide();
			$('#newgroupname').focus();
			GroupList.handleAddGroupInput('');
		}
		else {
			$('#newgroup-form').hide();
			$('#newgroup-init').show();
			$('#newgroupname').val('');
		}
	},

	handleAddGroupInput: function (input) {
		if(input.length) {
			$('#newgroup-form input[type="submit"]').attr('disabled', null);
		} else {
			$('#newgroup-form input[type="submit"]').attr('disabled', 'disabled');
		}
	},

	isGroupNameValid: function (groupname) {
		if ($.trim(groupname) === '') {
			OC.Notification.showTemporary(t('settings', 'Error creating group: {message}', {
				message: t('settings', 'A valid group name must be provided')
			}));
			return false;
		}
		return true;
	},

	hide: function (gid) {
		GroupList.getGroupLI(gid).hide();
	},
	show: function (gid) {
		GroupList.getGroupLI(gid).show();
	},
	remove: function (gid) {
		GroupList.getGroupLI(gid).remove();
	},
	empty: function () {
		$userGroupList.find('.isgroup').filter(function(index, item){
			return $(item).data('gid') !== '';
		}).remove();
	},
	initDeleteHandling: function () {
		//set up handler
		GroupDeleteHandler = new DeleteHandler('/settings/users/groups', 'groupname',
			GroupList.hide, GroupList.remove);

		//configure undo
		OC.Notification.hide();
		var msg = escapeHTML(t('settings', 'deleted {groupName}', {groupName: '%oid'})) + '<span class="undo">' +
			escapeHTML(t('settings', 'undo')) + '</span>';
		GroupDeleteHandler.setNotification(OC.Notification, 'deletegroup', msg,
			GroupList.show);

		//when to mark user for delete
		$userGroupList.on('click', '.delete', function () {
			// Call function for handling delete/undo
			GroupDeleteHandler.mark(GroupList.getElementGID(this));
		});

		//delete a marked user when leaving the page
		$(window).on('beforeunload', function () {
			GroupDeleteHandler.deleteEntry();
		});
	},

	getGroupLI: function (gid) {
		return $userGroupList.find('li.isgroup').filter(function () {
			return GroupList.getElementGID(this) === gid;
		});
	},

	getElementGID: function (element) {
		return ($(element).closest('li').data('gid') || '').toString();
	},
	getEveryoneCount: function () {
		$.ajax({
			type: "GET",
			dataType: "json",
			url: OC.generateUrl('/settings/users/stats')
		}).success(function (data) {
			$('#everyonegroup').data('usercount', data.totalUsers);
			$('#everyonecount').text(data.totalUsers);
		});
	}
};

$(document).ready( function () {
	$userGroupList = $('#usergrouplist');
	GroupList.initDeleteHandling();
	$sortGroupBy = $userGroupList.data('sort-groups');
	if ($sortGroupBy === 1) {
		// Disabled due to performance issues, when we don't need it for sorting
		GroupList.getEveryoneCount();
	}

	// Display or hide of Create Group List Element
	$('#newgroup-form').hide();
	$('#newgroup-init').on('click', function (e) {
		GroupList.toggleAddGroup(e);
	});

	$(document).on('click keydown keyup', function(event) {
		if(!GroupList.isAddGroupButtonVisible() &&
			!GroupList.elementBelongsToAddGroup(event.target) &&
			!GroupList.hasAddGroupNameText()) {
			GroupList.toggleAddGroup();
		}
		// Escape
		if(!GroupList.isAddGroupButtonVisible() && event.keyCode && event.keyCode === 27) {
			GroupList.toggleAddGroup();
		}
	});


	// Responsible for Creating Groups.
	$('#newgroup-form form').submit(function (event) {
		event.preventDefault();
		if(GroupList.isGroupNameValid($('#newgroupname').val())) {
			GroupList.createGroup($('#newgroupname').val());
		}
	});

	// click on group name
	$userGroupList.on('click', '.isgroup', function () {
		GroupList.showGroup(GroupList.getElementGID(this));
	});

	$('#newgroupname').on('input', function(){
		GroupList.handleAddGroupInput(this.value);
	});

	GroupList.update();
});
