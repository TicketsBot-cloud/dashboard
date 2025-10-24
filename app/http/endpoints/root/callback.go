package root

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/TicketsBot-cloud/dashboard/app"
	"github.com/TicketsBot-cloud/dashboard/app/http/session"
	"github.com/TicketsBot-cloud/dashboard/config"
	"github.com/TicketsBot-cloud/dashboard/rpc"
	"github.com/TicketsBot-cloud/dashboard/utils"
	"github.com/TicketsBot-cloud/gdl/rest"
	"github.com/TicketsBot-cloud/gdl/rest/request"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
)

func CallbackHandler(c *gin.Context) {
	code, ok := c.GetQuery("code")
	if !ok {
		c.JSON(400, utils.ErrorStr("Missing code query parameter"))
		return
	}

	res, err := rest.ExchangeCode(c, nil, config.Conf.Oauth.Id, config.Conf.Oauth.Secret, config.Conf.Oauth.RedirectUri, code)
	if err != nil {
		var oauthError request.OAuthError
		if errors.As(err, &oauthError) {
			if oauthError.ErrorCode == "invalid_grant" {
				c.JSON(400, utils.ErrorStr("Invalid code: try logging in again"))
				return
			}
		}

		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to exchange OAuth code"))
		return
	}

	scopes := strings.Split(res.Scope, " ")
	if !utils.Contains(scopes, "identify") {
		c.JSON(400, utils.ErrorStr("Missing identify scope"))
		return
	}

	// Get ID + name
	currentUser, err := rest.GetCurrentUser(context.Background(), fmt.Sprintf("Bearer %s", res.AccessToken), nil)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to fetch current user from Discord"))
		return
	}

	premiumTier, err  := rpc.PremiumClient.GetTierByUser(context.Background(), currentUser.Id, false)
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewServerError(err))
		return
	}

	store := session.SessionData{
		AccessToken:  res.AccessToken,
		Expiry:       (time.Now().UnixNano() / int64(time.Second)) + int64(res.ExpiresIn),
		RefreshToken: res.RefreshToken,
		Name:         currentUser.Username,
		Avatar:       currentUser.AvatarUrl(256),
		HasGuilds:    false,
	}

	guilds := make([]utils.GuildDto, 0)
	if utils.Contains(scopes, "guilds") {
		guilds, err = utils.LoadGuilds(c, res.AccessToken, currentUser.Id)
		if err != nil {
			_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to load user guilds"))
			return
		}

		store.HasGuilds = true
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"userid": strconv.FormatUint(currentUser.Id, 10),
		"sub":    strconv.FormatUint(currentUser.Id, 10),
		"iat":    time.Now().Unix(),
	})

	str, err := token.SignedString([]byte(config.Conf.Server.Secret))
	if err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to sign JWT token"))
		return
	}

	if err := session.Store.Set(currentUser.Id, store); err != nil {
		_ = c.AbortWithError(http.StatusInternalServerError, app.NewError(err, "Failed to save session"))
		return
	}

	resMap := gin.H{
		"success": true,
		"token":   str,
		"user_data": gin.H{
			"id":       strconv.FormatUint(currentUser.Id, 10),
			"username": currentUser.Username,
			"avatar":   currentUser.Avatar,
			"admin":    utils.Contains(config.Conf.Admins, currentUser.Id),
			"tier":     premiumTier,
		},
		"guilds": guilds,
	}

	c.JSON(http.StatusOK, resMap)
}
